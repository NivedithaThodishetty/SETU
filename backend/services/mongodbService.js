/**
 * Backend MongoDB Service Module
 * Comprehensive production-grade data layer for conversations, messages,
 * documents, mindmaps, summaries, user settings, and session audits.
 */
const { getStatus, mongoose } = require('../config/db');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const DocumentFile = require('../models/DocumentFile');
const MindMap = require('../models/MindMap');
const SavedSummary = require('../models/SavedSummary');
const UserSettings = require('../models/UserSettings');
const UserProgress = require('../models/UserProgress');
const ReadingCheck = require('../models/ReadingCheck');
const SessionLog = require('../models/SessionLog');

function isDbActive() {
  return mongoose.connection.readyState === 1;
}

/* -------------------------------------------------------------------------- */
/* In-memory document fallback                                                */
/* -------------------------------------------------------------------------- */

/**
 * Uploaded documents held in process memory when MongoDB is unavailable.
 *
 * Everything else in SETU degrades cleanly without a database because the client
 * keeps its own copy — but an uploaded file is different. The extracted text
 * lives only on the server, and "build a mind map from this file" and "ask about
 * this file" both look the document up again by id moments later. Without this,
 * every upload would summarise correctly and then 404 on the next click.
 *
 * Bounded and non-durable by design: it survives a click, not a restart.
 */
const MAX_MEMORY_DOCUMENTS = 50;
const memoryDocuments = new Map();

function rememberDocument(doc) {
  // Re-insert to move it to the end; Map preserves insertion order.
  memoryDocuments.delete(doc.id);
  memoryDocuments.set(doc.id, doc);

  while (memoryDocuments.size > MAX_MEMORY_DOCUMENTS) {
    const oldest = memoryDocuments.keys().next().value;
    memoryDocuments.delete(oldest);
  }
  return doc;
}

/* ----------------------------- Conversations ----------------------------- */

async function createConversation({
  id,
  userId = 'anonymous_user',
  title = 'New Research Chat',
  currentTopic = '',
  mode = 'mindmap',
  mindMapId = null,
  documentIds = [],
  metadata = {}
}) {
  if (!isDbActive()) return null;
  try {
    const convId = id || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const conversation = await Conversation.findOneAndUpdate(
      { id: convId },
      {
        id: convId,
        userId,
        title,
        currentTopic,
        mode,
        mindMapId,
        documentIds,
        metadata,
        lastMessageAt: new Date()
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return conversation;
  } catch (err) {
    console.warn('[MongoDB Service] Error creating conversation:', err.message);
    return null;
  }
}

async function listConversations({ userId = 'anonymous_user', limit = 50, search = '' }) {
  if (!isDbActive()) return [];
  try {
    const query = { userId };
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { currentTopic: regex }];
    }
    return await Conversation.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error listing conversations:', err.message);
    return [];
  }
}

async function getConversationById(id) {
  if (!isDbActive() || !id) return null;
  try {
    return await Conversation.findOne({ id }).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error fetching conversation:', err.message);
    return null;
  }
}

async function updateConversation(id, updates = {}) {
  if (!isDbActive() || !id) return null;
  try {
    return await Conversation.findOneAndUpdate(
      { id },
      { ...updates, updatedAt: new Date() },
      { returnDocument: 'after' }
    ).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error updating conversation:', err.message);
    return null;
  }
}

async function deleteConversation(id) {
  if (!isDbActive() || !id) return false;
  try {
    await Message.deleteMany({ conversationId: id });
    const res = await Conversation.deleteOne({ id });
    return res.deletedCount > 0;
  } catch (err) {
    console.warn('[MongoDB Service] Error deleting conversation:', err.message);
    return false;
  }
}

/* ----------------------------- Messages ----------------------------- */

async function saveMessage({
  id,
  conversationId,
  userId = 'anonymous_user',
  role,
  content,
  intent = 'chat',
  stage = 'done',
  sources = [],
  mindMapData = null,
  fileAttachments = [],
  modelUsed = null,
  provider = null,
  metadata = {}
}) {
  if (!isDbActive() || !conversationId || !role) return null;
  try {
    const msgId = id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const msg = await Message.findOneAndUpdate(
      { id: msgId },
      {
        id: msgId,
        conversationId,
        userId,
        role,
        content: content || '',
        intent,
        stage,
        sources,
        mindMapData,
        fileAttachments,
        modelUsed,
        provider,
        metadata
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Update parent conversation timestamp
    await Conversation.findOneAndUpdate(
      { id: conversationId },
      { lastMessageAt: new Date(), updatedAt: new Date() }
    ).catch((err) => {
      console.warn('[MongoDB Service] Failed to update conversation timestamp:', err.message);
    });

    return msg;
  } catch (err) {
    console.warn('[MongoDB Service] Error saving message:', err.message);
    return null;
  }
}

async function listMessages({ conversationId, limit = 100 }) {
  if (!isDbActive() || !conversationId) return [];
  try {
    return await Message.find({ conversationId }).sort({ createdAt: 1 }).limit(limit).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error listing messages:', err.message);
    return [];
  }
}

/* ----------------------------- Documents & Uploaded Files ----------------------------- */

async function saveDocumentFile({
  id,
  userId = 'anonymous_user',
  conversationId = null,
  originalName,
  mimeType,
  size,
  extractedText,
  summary = '',
  keyPoints = [],
  pageCount = 1,
  charCount = 0,
  tokenCount = 0,
  structuredSections = [],
  metadata = {}
}) {
  if (!originalName || !extractedText) return null;

  const fileId = id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id: fileId,
    userId,
    conversationId,
    originalName,
    mimeType,
    size,
    extractedText,
    summary,
    keyPoints,
    pageCount,
    charCount: charCount || extractedText.length,
    tokenCount: tokenCount || Math.ceil(extractedText.length / 4),
    structuredSections,
    metadata
  };

  if (!isDbActive()) {
    return rememberDocument({ ...record, createdAt: new Date(), persistedToDb: false });
  }

  try {
    const doc = await DocumentFile.findOneAndUpdate(
      { id: fileId },
      record,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return doc;
  } catch (err) {
    console.warn('[MongoDB Service] Error saving document:', err.message);
    // Keep it in memory so the follow-up actions on this upload still work.
    return rememberDocument({ ...record, createdAt: new Date(), persistedToDb: false });
  }
}

async function listDocumentFiles({ userId = 'anonymous_user', conversationId = null, limit = 50 }) {
  const fromMemory = [...memoryDocuments.values()]
    .filter((doc) => doc.userId === userId && (!conversationId || doc.conversationId === conversationId))
    .map(({ extractedText, ...rest }) => rest)
    .reverse();

  if (!isDbActive()) return fromMemory.slice(0, limit);

  try {
    const query = { userId };
    if (conversationId) query.conversationId = conversationId;
    const stored = await DocumentFile.find(query, { extractedText: 0 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Memory can hold uploads from a window where the database was unreachable.
    const seen = new Set(stored.map((doc) => doc.id));
    return [...stored, ...fromMemory.filter((doc) => !seen.has(doc.id))].slice(0, limit);
  } catch (err) {
    console.warn('[MongoDB Service] Error listing documents:', err.message);
    return fromMemory.slice(0, limit);
  }
}

async function getDocumentFileById(id) {
  if (!id) return null;

  if (isDbActive()) {
    try {
      const doc = await DocumentFile.findOne({ id }).lean();
      if (doc) return doc;
    } catch (err) {
      console.warn('[MongoDB Service] Error fetching document:', err.message);
    }
  }

  return memoryDocuments.get(id) || null;
}

async function deleteDocumentFile(id) {
  if (!id) return false;

  const removedFromMemory = memoryDocuments.delete(id);
  if (!isDbActive()) return removedFromMemory;

  try {
    const res = await DocumentFile.deleteOne({ id });
    return res.deletedCount > 0 || removedFromMemory;
  } catch (err) {
    console.warn('[MongoDB Service] Error deleting document:', err.message);
    return removedFromMemory;
  }
}

/* ----------------------------- MindMaps ----------------------------- */

async function saveMindMap({
  id,
  userId = 'anonymous_user',
  conversationId = null,
  documentId = null,
  title,
  topic,
  summary,
  keyFacts = [],
  followUps = [],
  sources = [],
  grounded = false,
  root,
  isLensHandoff = false,
  metadata = {}
}) {
  if (!isDbActive() || !title || !root) return null;
  try {
    const mapId = id || `map_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Count total nodes
    let nodeCount = 1;
    const countNodes = (n) => {
      if (n?.children && Array.isArray(n.children)) {
        nodeCount += n.children.length;
        n.children.forEach(countNodes);
      }
    };
    countNodes(root);

    const updated = await MindMap.findOneAndUpdate(
      { id: mapId },
      {
        id: mapId,
        userId,
        conversationId,
        documentId,
        title,
        topic: topic || title,
        summary: summary || '',
        keyFacts,
        followUps,
        sources,
        grounded,
        root,
        nodeCount,
        isLensHandoff,
        metadata,
        updatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return updated;
  } catch (err) {
    console.warn('[MongoDB Service] Error saving mindmap:', err.message);
    return null;
  }
}

async function listMindMaps({ userId = 'anonymous_user', search = '', limit = 50 }) {
  if (!isDbActive()) return [];
  try {
    const query = { userId };
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { summary: regex }, { topic: regex }];
    }
    return await MindMap.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error listing mindmaps:', err.message);
    return [];
  }
}

async function getMindMapById(id) {
  if (!isDbActive() || !id) return null;
  try {
    return await MindMap.findOne({ id }).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error fetching mindmap:', err.message);
    return null;
  }
}

async function deleteMindMap(id) {
  if (!isDbActive() || !id) return false;
  try {
    const res = await MindMap.deleteOne({ id });
    return res.deletedCount > 0;
  } catch (err) {
    console.warn('[MongoDB Service] Error deleting mindmap:', err.message);
    return false;
  }
}

async function clearMindMaps(userId = 'anonymous_user') {
  if (!isDbActive()) return false;
  try {
    await MindMap.deleteMany({ userId });
    return true;
  } catch (err) {
    console.warn('[MongoDB Service] Error clearing mindmaps:', err.message);
    return false;
  }
}

/* ----------------------------- Summaries ----------------------------- */

async function saveSummary({
  id,
  userId = 'anonymous_user',
  title,
  content,
  summaryPoints = [],
  mode = 'summary',
  resultData = {},
  metadata = {}
}) {
  if (!isDbActive()) return null;
  try {
    const summaryId = id || `sum_${Date.now()}`;
    const doc = await SavedSummary.findOneAndUpdate(
      { id: summaryId },
      {
        id: summaryId,
        userId,
        title: title || 'Untitled Summary',
        content: content || '',
        summaryPoints,
        mode,
        resultData,
        metadata
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return doc;
  } catch (err) {
    console.warn('[MongoDB Service] Error saving summary:', err.message);
    return null;
  }
}

async function listSummaries({ userId = 'anonymous_user', limit = 50 }) {
  if (!isDbActive()) return [];
  try {
    return await SavedSummary.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error listing summaries:', err.message);
    return [];
  }
}

/* ----------------------------- User Settings ----------------------------- */

async function getUserSettings(userId = 'anonymous_user') {
  if (!isDbActive()) return null;
  try {
    return await UserSettings.findOne({ userId }).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error getting settings:', err.message);
    return null;
  }
}

async function saveUserSettings(userId = 'anonymous_user', settings = {}) {
  if (!isDbActive()) return null;
  try {
    return await UserSettings.findOneAndUpdate(
      { userId },
      { ...settings, userId, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error saving settings:', err.message);
    return null;
  }
}

/* ----------------------------- Audit / Session ----------------------------- */

async function logSession(userId = 'anonymous_user', action, details = {}) {
  if (!isDbActive()) return null;
  try {
    return await SessionLog.create({ userId, action, details, timestamp: new Date() });
  } catch (err) {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Reward progress                                                            */
/* -------------------------------------------------------------------------- */

async function getUserProgress(userId = 'anonymous_user') {
  if (!isDbActive()) return null;
  try {
    return await UserProgress.findOne({ userId }).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error getting progress:', err.message);
    return null;
  }
}

/**
 * Mirror the browser's progress snapshot.
 *
 * The client sends whole state rather than deltas, so a dropped or duplicated
 * sync can never double-count points. `points` and the streak counters are
 * clamped to their previous high-water mark: two tabs syncing slightly stale
 * snapshots would otherwise let the later, smaller write roll a streak
 * backwards.
 */
async function saveUserProgress(userId = 'anonymous_user', progress = {}) {
  if (!isDbActive()) return null;
  try {
    const existing = await UserProgress.findOne({ userId }).lean();

    const merged = {
      userId,
      points: Math.max(Number(progress.points) || 0, existing?.points || 0),
      counters: progress.counters && typeof progress.counters === 'object' ? progress.counters : {},
      milestones: Array.from(
        new Set([...(existing?.milestones || []), ...(progress.milestones || [])])
      ),
      streakDays: Number(progress.streakDays) || 0,
      longestStreakDays: Math.max(
        Number(progress.longestStreakDays) || 0,
        existing?.longestStreakDays || 0
      ),
      lastActiveDay: progress.lastActiveDay || existing?.lastActiveDay || null,
      updatedAt: new Date()
    };

    return await UserProgress.findOneAndUpdate({ userId }, merged, {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }).lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error saving progress:', err.message);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Reading Check                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Store one completed reading task.
 *
 * Unlike the reward mirror, this is an append-only log rather than a snapshot:
 * every reading is its own document because the whole value is the sequence.
 * Overwriting a previous result would destroy the only chart this product can
 * honestly draw.
 */
async function saveReadingCheck(record) {
  if (!isDbActive() || !record?.id || !record?.userId) return null;
  try {
    return await ReadingCheck.create(record);
  } catch (err) {
    console.warn('[MongoDB Service] Error saving reading check:', err.message);
    return null;
  }
}

/**
 * A user's readings, oldest first.
 *
 * Ascending because every caller plots these as a line over time, and a
 * descending list is one reverse away from a chart drawn backwards.
 */
async function listReadingChecks({ userId = 'anonymous_user', type = null, limit = 60 }) {
  if (!isDbActive()) return [];
  try {
    const query = { userId };
    if (type) query.type = type;
    return await ReadingCheck.find(query, { transcript: 0 })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  } catch (err) {
    console.warn('[MongoDB Service] Error listing reading checks:', err.message);
    return [];
  }
}

async function deleteReadingChecks(userId) {
  if (!isDbActive() || !userId) return false;
  try {
    await ReadingCheck.deleteMany({ userId });
    return true;
  } catch (err) {
    console.warn('[MongoDB Service] Error clearing reading checks:', err.message);
    return false;
  }
}

module.exports = {
  isConfigured: () => getStatus().configured,
  isDbActive,
  // Conversations & Messages
  createConversation,
  listConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  saveMessage,
  listMessages,
  // Documents & Uploaded Files
  saveDocumentFile,
  listDocumentFiles,
  getDocumentFileById,
  deleteDocumentFile,
  // MindMaps
  saveMindMap,
  listMindMaps,
  getMindMapById,
  deleteMindMap,
  clearMindMaps,
  // Summaries
  saveSummary,
  listSummaries,
  // User Settings & Session
  getUserSettings,
  saveUserSettings,
  // Reading Check
  saveReadingCheck,
  listReadingChecks,
  deleteReadingChecks,
  // Reward progress
  getUserProgress,
  saveUserProgress,
  logSession
};
