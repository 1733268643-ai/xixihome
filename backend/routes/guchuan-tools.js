import express from 'express';
import { callGuchuanTool } from '../lib/guchuan-tools-client.js';

const router = express.Router();

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

// 预留路由：等 fishing 工具本体实现后启用同一个 client 和鉴权方式。
router.get('/fishing/status', async (req, res, next) => {
  try {
    res.json(await callGuchuanTool('/fishing/status', req.query));
  } catch (e) {
    next(e);
  }
});

router.get('/fishing/command', async (req, res, next) => {
  try {
    res.json(await callGuchuanTool('/fishing/command', req.query));
  } catch (e) {
    next(e);
  }
});

router.get('/fishing/recent', async (req, res, next) => {
  try {
    res.json(await callGuchuanTool('/fishing/recent', req.query));
  } catch (e) {
    next(e);
  }
});

export default router;
