/**
 * Centralised error handler.
 * Returns a stable JSON shape and never leaks a stack trace to the client.
 */
const config = require('../config');

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
module.exports = function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('[SETU error]', err.stack || err.message);
  }

  // In production, never leak internal error details for server errors.
  // Client errors (4xx) keep their message because it is actionable.
  const message =
    status >= 500 && config.nodeEnv === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(config.nodeEnv === 'development' && status >= 500 ? { stack: err.stack } : {})
  });
};
