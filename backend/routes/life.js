// 生活记录：关心你（吃药/体重/睡眠/经期）与日历事件。
// 2026-08-31 起存主机本地文件（lib/life-local.js），不再依赖 Supabase。
import express from 'express';
import * as life from '../lib/life-local.js';

export default function lifeRouter(store) {
  const router = express.Router();

  const fail = (res, e) => res.status(200).json({ available: false, reason: String(e?.message || e) });

  // ── 头像（存 settings，沿用 store 层）──────────────────
  router.get('/avatars', async (_req, res) => {
    try {
      const [xixi, dengdeng] = await Promise.all([
        store.getSetting('avatar_xixi'), store.getSetting('avatar_dengdeng'),
      ]);
      res.json({ available: true, xixi: xixi || null, dengdeng: dengdeng || null });
    } catch (e) { fail(res, e); }
  });

  router.put('/avatars', async (req, res) => {
    const { who, image } = req.body || {};
    if (who !== 'xixi' && who !== 'dengdeng') return res.status(400).json({ error: 'who 只能是 xixi 或 dengdeng' });
    if (image != null && typeof image === 'string' && image.length > 400_000) {
      return res.status(400).json({ error: '图太大了，换张小的' });
    }
    try {
      await store.setSetting(`avatar_${who}`, image || '');
      res.json({ ok: true, who });
    } catch (e) { fail(res, e); }
  });

  // ── 关心你 ───────────────────────────────────────────
  const KINDS = new Set(['med', 'weight', 'sleep', 'period', 'exercise']);

  /** 最近状态摘要：今天吃药没、最近体重与近 7 次曲线、昨晚睡多久、距下次经期 */
  router.get('/health/summary', async (_req, res) => {
    try {
      const since = new Date(Date.now() - 120 * 864e5).toISOString();
      const rows = life.listHealth({ since, limit: 400 });
      const today = new Date().toISOString().slice(0, 10);
      const byKind = (k) => rows.filter((r) => r.kind === k);

      const meds = byKind('med');
      const weights = byKind('weight');
      const sleeps = byKind('sleep');
      const periods = byKind('period');
      const exercises = byKind('exercise');

      const lastPeriod = periods[0]?.logged_at || null;
      let periodIn = null;
      if (lastPeriod) {
        const gap = 28;
        const days = Math.round((Date.now() - new Date(lastPeriod).getTime()) / 864e5);
        periodIn = gap - (days % gap);
      }
      res.json({
        available: true,
        med: { doneToday: meds.some((r) => r.logged_at.slice(0, 10) === today), lastAt: meds[0]?.logged_at || null },
        weight: {
          latest: weights[0] ? Number(weights[0].value) : null,
          at: weights[0]?.logged_at || null,
          trend: weights.slice(0, 7).reverse().map((r) => Number(r.value)),
          delta: weights.length > 1 ? Number(weights[0].value) - Number(weights[weights.length - 1].value) : null,
        },
        sleep: { lastHours: sleeps[0] ? Number(sleeps[0].value) : null, at: sleeps[0]?.logged_at || null },
        exercise: {
          doneToday: exercises.some((r) => r.logged_at.slice(0, 10) === today),
          lastAt: exercises[0]?.logged_at || null,
          todaySteps: exercises.find((r) => r.logged_at.slice(0, 10) === today)?.value ?? null,
        },
        period: { lastAt: lastPeriod, inDays: periodIn },
      });
    } catch (e) { fail(res, e); }
  });

  /** 记一笔。body: { kind, value?, note?, loggedAt? } */
  router.post('/health', async (req, res) => {
    const { kind, value, note, loggedAt } = req.body || {};
    if (!KINDS.has(kind)) return res.status(400).json({ error: '不认识这个类型' });
    try {
      const row = await life.addHealth({ kind, value, note, loggedAt });
      res.json({ ok: true, row });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  /** 某一类的历史 */
  router.get('/health/:kind', async (req, res) => {
    if (!KINDS.has(req.params.kind)) return res.status(400).json({ error: '不认识这个类型' });
    try {
      res.json({ available: true, rows: life.listHealth({ kind: req.params.kind, limit: 60 }) });
    } catch (e) { fail(res, e); }
  });

  router.delete('/health/:id', async (req, res) => {
    try {
      await life.deleteHealth(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  // ── 日历 ─────────────────────────────────────────────
  /** 某月事件。query: ym=2026-07 */
  router.get('/events', async (req, res) => {
    const ym = /^\d{4}-\d{2}$/.test(req.query.ym || '') ? req.query.ym : new Date().toISOString().slice(0, 7);
    try {
      const from = `${ym}-01`;
      const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1);
      const to = d.toISOString().slice(0, 10);
      res.json({ available: true, ym, rows: life.listEvents(from, to) });
    } catch (e) { fail(res, e); }
  });

  /** 加一个日子。body: { title, date, note?, source? } */
  router.post('/events', async (req, res) => {
    const { title, date, note, source, obId } = req.body || {};
    if (!title || !date) return res.status(400).json({ error: '要有标题和日期' });
    try {
      const row = await life.addEvent({ title, date, note, source, obId });
      res.json({ ok: true, row });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  router.put('/events/:id', async (req, res) => {
    const patch = {};
    for (const k of ['title', 'note', 'date']) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ error: '没有要改的' });
    try {
      const row = await life.updateEvent(req.params.id, patch);
      if (!row) return res.status(404).json({ error: '没有这条' });
      res.json({ ok: true, row });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  router.delete('/events/:id', async (req, res) => {
    try {
      await life.deleteEvent(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  return router;
}
