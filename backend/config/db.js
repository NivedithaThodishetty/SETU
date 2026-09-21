const dns = require('dns');
const mongoose = require('mongoose');
const config = require('./index');

let isConnected = false;
let connectionPromise = null;
let listenersBound = false;
let lastError = null;

/* -------------------------------------------------------------------------- */
/* SRV resolution                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Split a `mongodb+srv://` URI into the parts needed to rebuild it as a direct
 * seed list.
 *
 * Deliberately regex rather than `new URL()`. The URL parser percent-decodes
 * `username:password`, and a password containing `%40` or `%2F` — which Atlas
 * requires for `@` and `/` — comes back decoded and then re-encodes wrongly on
 * the way out, producing an authentication failure that looks like a bad
 * credential rather than a mangled one.
 */
function splitSrvUri(uri) {
  const match = uri.match(/^mongodb\+srv:\/\/(?:([^@]*)@)?([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/);
  if (!match) return null;
  const [, credentials = '', hostname, database = '', query = ''] = match;
  return { credentials, hostname, database, query };
}

/**
 * Rebuild an SRV URI as a direct seed list, so the driver needs no DNS at all.
 *
 * WHY
 * ---
 * `mongodb+srv://` is a convenience: the driver does an SRV lookup to discover
 * the shard hostnames and a TXT lookup to discover the connection options,
 * every time it connects. On a network whose resolver refuses SRV — which this
 * one does, with ECONNREFUSED — that costs a failed system lookup, a fallback
 * lookup against a public resolver, and then the driver's own repeat of both.
 * It is the whole of the ~15s cold start.
 *
 * The seed-list form (`mongodb://host1,host2,host3/db?replicaSet=...`) is what
 * SRV resolves *to*. Connecting with it directly is not a workaround or a
 * downgrade — it is the same cluster, the same replica set, the same TLS — it
 * simply skips the discovery step.
 *
 * The hosts are still discovered dynamically here rather than hardcoded,
 * because Atlas can move a cluster's shards. Set `MONGODB_DIRECT_URI` to pin
 * them and skip DNS entirely; the derived URI is logged at boot for that
 * purpose. If the pinned hosts ever go stale, the driver reports a plain
 * connection failure and the fix is to drop the variable.
 */
async function deriveDirectUri(uri, resolver) {
  const parts = splitSrvUri(uri);
  if (!parts) return null;

  const [srvRecords, txtRecords] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${parts.hostname}`),
    // A cluster without a TXT record is legal; its options just come from the
    // URI alone, so a failure here is not fatal.
    resolver.resolveTxt(parts.hostname).catch(() => [])
  ]);

  if (!srvRecords.length) return null;

  const seeds = srvRecords
    .map((record) => `${record.name}:${record.port}`)
    .sort()
    .join(',');

  /*
   * Option precedence: TXT record first, then whatever the URI already carried,
   * so an explicit choice in MONGODB_URI still wins over the cluster default.
   */
  const options = new Map();
  for (const pair of txtRecords.flat().join('&').split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) options.set(key.trim(), value.trim());
  }
  for (const pair of parts.query.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) options.set(key.trim(), value.trim());
  }

  // `mongodb+srv://` implies TLS. The seed-list form does not, so it has to be
  // stated — without it Atlas rejects the handshake.
  if (!options.has('ssl') && !options.has('tls')) options.set('tls', 'true');

  const query = [...options].map(([key, value]) => `${key}=${value}`).join('&');
  const auth = parts.credentials ? `${parts.credentials}@` : '';

  return `mongodb://${auth}${seeds}/${parts.database}?${query}`;
}

/** Hide the password in anything we log. */
function maskUri(uri) {
  return String(uri || '').replace(/\/\/([^:]*):([^@]*)@/, '//$1:***@');
}

/**
 * `mongodb+srv://` needs SRV and TXT lookups before the driver can reach a
 * single node. Plenty of networks answer A records but refuse those two record
 * types, and the driver reports it as `querySrv ECONNREFUSED` — which reads like
 * a dead cluster rather than a DNS policy.
 *
 * So: try the system resolver first, and only if it refuses, check whether a
 * public resolver can answer. If one can, point the process-wide resolver at it
 * so the driver's own lookup succeeds too. `dns.lookup` (used for the actual
 * socket connections) still goes through the OS, so nothing else changes.
 */
/**
 * Work out the URI to actually hand the driver.
 *
 * Returns `{ uri }` on success, or `null` when the cluster cannot be reached at
 * all. The returned URI is a direct seed list wherever we managed to resolve
 * one, so the driver performs no DNS of its own.
 */
async function resolveConnectionUri(uri) {
  // Already a seed list, or explicitly pinned: nothing to discover.
  if (!uri.startsWith('mongodb+srv://')) return { uri };

  let hostname;
  try {
    hostname = new URL(uri).hostname;
  } catch {
    return { uri }; // Let the driver produce the parse error itself.
  }

  const srvName = `_mongodb._tcp.${hostname}`;
  const systemResolver = dns.promises;

  /*
   * Try the system resolver first. When it works this is one lookup and we
   * still convert to a seed list, because the driver would otherwise repeat
   * both lookups itself on connect.
   */
  try {
    await systemResolver.resolveSrv(srvName);
    const direct = await deriveDirectUri(uri, systemResolver).catch(() => null);
    if (direct) {
      console.log(`  [MongoDB] Resolved ${hostname} to a direct seed list; skipping SRV on connect.`);
      return { uri: direct, derived: true };
    }
    return { uri };
  } catch (systemError) {
    const servers = config.dnsFallbackServers;
    if (!servers.length) {
      console.warn(
        `  [MongoDB] SRV lookup for ${hostname} failed (${systemError.code || systemError.message}).`
      );
      return null;
    }

    const resolver = new dns.promises.Resolver();
    resolver.setServers(servers);

    let direct;
    try {
      direct = await deriveDirectUri(uri, resolver);
    } catch (fallbackError) {
      console.warn(
        `  [MongoDB] SRV lookup for ${hostname} failed on both the system resolver ` +
          `(${systemError.code || systemError.message}) and ${servers.join(', ')} ` +
          `(${fallbackError.code || fallbackError.message}).`
      );
      return null;
    }

    if (!direct) return null;

    console.log(
      `  [MongoDB] System DNS refuses SRV records (${systemError.code || systemError.message}); ` +
        `resolved ${hostname} via ${servers.join(', ')} instead.`
    );

    /*
     * Deliberately NOT calling `dns.setServers(servers)` any more.
     *
     * That was here so the driver's own SRV lookup would succeed, which meant
     * repeating the work we just did — and it redirected every other DNS query
     * in the process to a public resolver as a side effect, including the
     * engine's outbound calls. Handing the driver a seed list removes the need
     * for both.
     */
    return { uri: direct, derived: true };
  }
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => {
    isConnected = true;
    lastError = null;
    console.log(`  [MongoDB] Connected to "${mongoose.connection.name}" at ${mongoose.connection.host}`);
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    lastError = err.message;
  });

  mongoose.connection.on('disconnected', () => {
    if (!isConnected) return; // Never connected — the connect path reports this.
    isConnected = false;
    console.log('  [MongoDB] Disconnected from database');
  });
}

async function connectDB() {
  if (isConnected) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  const mongoUri = config.mongoUri;
  if (!mongoUri || process.env.MONGODB_DISABLED === 'true') {
    const reason =
      process.env.MONGODB_DISABLED === 'true'
        ? 'MongoDB is explicitly disabled by MONGODB_DISABLED=true.'
        : 'No MONGODB_URI configured.';
    console.log(`  [MongoDB] ${reason} Operating in local in-memory/browser fallback mode.`);
    return null;
  }

  bindListeners();

  connectionPromise = (async () => {
    const resolved = await resolveConnectionUri(mongoUri);
    if (!resolved) {
      lastError = 'SRV DNS lookup failed';
      console.log(
        '  [MongoDB] Continuing with client-side/local fallback storage. ' +
          'Set DNS_SERVERS to a resolver that answers SRV records, or set ' +
          'MONGODB_DIRECT_URI to the seed-list form of the connection string.'
      );
      return null;
    }

    /*
     * Printed once at boot so it can be pinned in .env as MONGODB_DIRECT_URI,
     * which removes DNS from startup entirely — worth doing before a live demo
     * on an unfamiliar network. Credentials are masked; the shape is what
     * matters, and the password is already in the operator's own .env.
     */
    if (resolved.derived) {
      console.log(`  [MongoDB] Direct URI: ${maskUri(resolved.uri)}`);
    }

    try {
      const conn = await mongoose.connect(resolved.uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 15000),
        socketTimeoutMS: 45000,
        retryWrites: true,
        autoIndex: true
      });
      isConnected = true;
      return conn;
    } catch (err) {
      isConnected = false;
      lastError = err.message;
      console.warn(`  [MongoDB] Could not connect to ${config.safeMongoUri}: ${err.message}`);
      console.log(
        '  [MongoDB] Database is unreachable or the connection string is invalid. ' +
          'Continuing with client-side/local fallback storage.'
      );
      if (/authentication failed|bad auth/i.test(err.message)) {
        console.log('  [MongoDB] The username or password in MONGODB_URI was rejected by the cluster.');
      } else if (/IP that isn.t whitelisted|not allowed to connect/i.test(err.message)) {
        console.log('  [MongoDB] Add this machine\'s IP to the Atlas Network Access list.');
      }
      // Drop the cached promise so a later call can retry rather than being
      // permanently stuck in fallback mode after one transient failure.
      connectionPromise = null;
      return null;
    }
  })();

  return connectionPromise;
}

/**
 * Resolve once the in-flight connection attempt has settled.
 *
 * Connecting to Atlas takes a couple of seconds — SRV lookup, then a TLS
 * handshake — and the API starts listening immediately. Without this, a client
 * that loads during those two seconds reads an empty library and never asks
 * again, which is indistinguishable from a broken database.
 *
 * Resolves false immediately when nothing is in flight (no URI, or a previous
 * attempt already failed), so fallback mode is never delayed.
 */
function whenReady(timeoutMs = 10000) {
  if (isConnected) return Promise.resolve(true);
  if (!connectionPromise) return Promise.resolve(false);

  return Promise.race([
    Promise.resolve(connectionPromise).then(() => isConnected, () => false),
    new Promise((resolve) => {
      setTimeout(() => resolve(false), timeoutMs).unref();
    })
  ]);
}

function getStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const stateCode = mongoose.connection.readyState;
  const connected = isConnected && stateCode === 1;
  return {
    configured: Boolean(config.mongoUri),
    connected,
    state: states[stateCode] || 'unknown',
    database: connected ? mongoose.connection.name : config.mongoDbName,
    uri: config.safeMongoUri,
    lastError: connected ? null : lastError
  };
}

async function closeDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    isConnected = false;
    connectionPromise = null;
  }
}

module.exports = {
  connectDB,
  whenReady,
  getStatus,
  closeDB,
  mongoose
};
