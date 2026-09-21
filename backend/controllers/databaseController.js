/**
 * Database Controller for MongoDB persistence endpoints
 */
const mongoService = require('../services/mongodbService');
const { getStatus } = require('../config/db');

async function handleGetMindMaps(req, res) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
  const search = req.query.search || '';
  const maps = await mongoService.listMindMaps({ userId, search });
  res.json({ maps, dbConnected: mongoService.isDbActive() });
}

async function handleSaveMindMap(req, res) {
  const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
  const mapData = { ...req.body, userId };
  const saved = await mongoService.saveMindMap(mapData);
  res.json({
    success: Boolean(saved),
    map: saved || mapData,
    persistedToDb: Boolean(saved)
  });
}

async function handleGetMindMapById(req, res) {
  const map = await mongoService.getMindMapById(req.params.id);
  if (!map) {
    return res.status(404).json({ error: 'Map not found' });
  }
  res.json({ map });
}

async function handleDeleteMindMap(req, res) {
  const success = await mongoService.deleteMindMap(req.params.id);
  res.json({ success, id: req.params.id });
}

async function handleClearMindMaps(req, res) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
  const success = await mongoService.clearMindMaps(userId);
  res.json({ success });
}

async function handleGetSummaries(req, res) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
  const summaries = await mongoService.listSummaries({ userId });
  res.json({ summaries, dbConnected: mongoService.isDbActive() });
}

async function handleSaveSummary(req, res) {
  const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
  const summaryData = { ...req.body, userId };
  const saved = await mongoService.saveSummary(summaryData);
  res.json({
    success: Boolean(saved),
    summary: saved || summaryData,
    persistedToDb: Boolean(saved)
  });
}

async function handleGetSettings(req, res) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
  const settings = await mongoService.getUserSettings(userId);
  res.json({ settings: settings || null, dbConnected: mongoService.isDbActive() });
}

async function handleSaveSettings(req, res) {
  const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
  const saved = await mongoService.saveUserSettings(userId, req.body);
  res.json({
    success: Boolean(saved),
    settings: saved || req.body,
    persistedToDb: Boolean(saved)
  });
}

async function handleGetProgress(req, res) {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous_user';
  const progress = await mongoService.getUserProgress(userId);
  res.json({ progress: progress || null, dbConnected: mongoService.isDbActive() });
}

async function handleSaveProgress(req, res) {
  const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous_user';
  const saved = await mongoService.saveUserProgress(userId, req.body);
  res.json({
    success: Boolean(saved),
    progress: saved || req.body,
    persistedToDb: Boolean(saved)
  });
}

async function handleDbStatus(req, res) {
  res.json(getStatus());
}

module.exports = {
  handleGetMindMaps,
  handleSaveMindMap,
  handleGetMindMapById,
  handleDeleteMindMap,
  handleClearMindMaps,
  handleGetSummaries,
  handleSaveSummary,
  handleGetSettings,
  handleSaveSettings,
  handleGetProgress,
  handleSaveProgress,
  handleDbStatus
};
