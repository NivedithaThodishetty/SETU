/**
 * Conversation Controller
 * Handles conversation history, message threads, and interaction persistence in MongoDB.
 */

const mongoService = require('../services/mongodbService');

/**
 * GET /api/conversations
 */
async function handleListConversations(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
    const search = req.query.search || '';
    const conversations = await mongoService.listConversations({ userId, search });
    res.json({ conversations, dbConnected: mongoService.isDbActive() });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations
 *
 * Returns the conversation whether or not the database accepted it, matching
 * the mind map and summary endpoints: the client keeps working from its own
 * copy when persistence is unavailable, and `persistedToDb` says which it got.
 */
async function handleCreateConversation(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
    const requested = { ...req.body, userId };

    const saved = await mongoService.createConversation(requested);

    const conversation = saved || {
      ...requested,
      id: requested.id || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: requested.title || 'New Research Chat',
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString()
    };

    res.status(201).json({ conversation, persistedToDb: Boolean(saved) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/:id
 */
async function handleGetConversation(req, res, next) {
  try {
    const conversation = await mongoService.getConversationById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const messages = await mongoService.listMessages({ conversationId: req.params.id });
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/conversations/:id
 */
async function handleUpdateConversation(req, res, next) {
  try {
    const updated = await mongoService.updateConversation(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    res.json({ conversation: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/conversations/:id
 */
async function handleDeleteConversation(req, res, next) {
  try {
    const success = await mongoService.deleteConversation(req.params.id);
    res.json({ success, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/:id/messages
 */
async function handleGetMessages(req, res, next) {
  try {
    const messages = await mongoService.listMessages({ conversationId: req.params.id });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/messages
 */
async function handleSaveMessage(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
    const requested = { ...req.body, conversationId: req.params.id, userId };

    if (!requested.role) {
      return res.status(400).json({ error: 'A message "role" is required.' });
    }

    const saved = await mongoService.saveMessage(requested);

    res.status(201).json({
      message: saved || { ...requested, id: `msg_${Date.now()}`, createdAt: new Date().toISOString() },
      persistedToDb: Boolean(saved)
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListConversations,
  handleCreateConversation,
  handleGetConversation,
  handleUpdateConversation,
  handleDeleteConversation,
  handleGetMessages,
  handleSaveMessage
};
