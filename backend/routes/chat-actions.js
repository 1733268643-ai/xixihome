import express from 'express';
import { requireChatActionKey } from '../lib/chat-action-auth.js';
import { callGuchuanTool } from '../lib/guchuan-tools-client.js';
import { getStartupMemory, getRecentDiaries, getMemoryFile, searchMemory } from '../lib/github-memory-reader.js';

const router = express.Router();

router.use(requireChatActionKey);

router.get('/status', async (_req, res, next) => {
  try {
    res.json(await callGuchuanTool('/status'));
  } catch (e) {
    next(e);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    res.json(await callGuchuanTool('/activity', {
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (e) {
    next(e);
  }
});

router.get('/memory/startup', async (_req, res, next) => {
  try {
    res.json(await getStartupMemory());
  } catch (e) {
    next(e);
  }
});

router.get('/memory/recent', async (req, res, next) => {
  try {
    res.json(await getRecentDiaries(req.query.days || req.query.limit));
  } catch (e) {
    next(e);
  }
});

router.get('/memory/file', async (req, res, next) => {
  try {
    res.json(await getMemoryFile(req.query.path, req.query.maxChars));
  } catch (e) {
    next(e);
  }
});

router.get('/memory/search', async (req, res, next) => {
  try {
    res.json(await searchMemory(req.query.q));
  } catch (e) {
    next(e);
  }
});

export default router;
