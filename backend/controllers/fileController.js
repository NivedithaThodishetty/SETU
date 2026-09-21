/**
 * File & Document Controller
 * Handles file uploads, document management, and AI interactions on user files.
 */

const multer = require('multer');
const documentService = require('../services/documentService');
const mongoService = require('../services/mongodbService');
const config = require('../config');

// Configure multer for in-memory buffer storage (up to max configured upload limit)
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileUploadSizeBytes || 25 * 1024 * 1024 }
}).single('file');

/**
 * POST /api/files/upload
 * multipart/form-data with field "file" and optional "conversationId"
 */
async function handleUploadFile(req, res, next) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `File is too large. Maximum supported file size is ${Math.round(
            (config.maxFileUploadSizeBytes || 25000000) / 1024 / 1024
          )}MB.`
        });
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided. Please attach a file.' });
    }

    try {
      const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
      const conversationId =
        req.headers['x-conversation-id'] || req.body.conversationId || null;

      const doc = await documentService.processAndSaveFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        userId,
        conversationId
      });

      res.status(201).json({
        success: true,
        document: doc
      });
    } catch (processErr) {
      console.error('[File Controller] Upload process failed:', processErr);
      res.status(500).json({ error: processErr.message || 'Could not process uploaded file.' });
    }
  });
}

/**
 * GET /api/files
 */
async function handleListFiles(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
    const conversationId = req.query.conversationId || null;
    const files = await mongoService.listDocumentFiles({ userId, conversationId });
    res.json({ files, dbConnected: mongoService.isDbActive() });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id
 */
async function handleGetFileById(req, res, next) {
  try {
    const file = await mongoService.getDocumentFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    res.json({ document: file });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/files/:id
 */
async function handleDeleteFile(req, res, next) {
  try {
    const success = await mongoService.deleteDocumentFile(req.params.id);
    res.json({ success, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/mindmap
 */
async function handleMindMapFromFile(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
    const map = await documentService.createMindMapFromDocument({
      documentId: req.params.id,
      userId
    });
    res.json(map);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/query
 * body: { query: string }
 */
async function handleQueryFile(req, res, next) {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'A question or query is required.' });
    }

    const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
    const result = await documentService.queryDocument({
      documentId: req.params.id,
      query: query.trim(),
      userId
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleUploadFile,
  handleListFiles,
  handleGetFileById,
  handleDeleteFile,
  handleMindMapFromFile,
  handleQueryFile
};
