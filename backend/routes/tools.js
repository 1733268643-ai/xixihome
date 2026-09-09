import express from 'express';
import { requireToolsSecret } from '../lib/tools/auth.js';
import { queryPhoneActivity } from '../lib/tools/activity.js';

export const installedTools = [
  {
    name: 'activity',
    path: '/api/tools/activity',
    description: '读取邓邓最近打开过哪些 App',
  },
];

export async function handleActivityQuery(req, res, next) {
  try {
    const result = await queryPhoneActivity({
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

const router = express.Router();

router.use(requireToolsSecret);

router.get('/status', (_req, res) => {
  res.json({ ok: true, tools: installedTools });
});

router.get('/activity', handleActivityQuery);

export default router;
