import pg from 'pg';
import { listTimelineStars } from './timeline.js';

const { Pool } = pg;

const DATABASE_URL = process.env.LMC5_DATABASE_URL || '';

let pool = null;
function client() {
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  return pool;
}

function firstLine(content) {
  const text = String(content || '').trim();
  if (!text) return '未命名记忆';
  const line = text.split(/\n/)[0].replace(/^[#*\s]+/, '').trim();
  return line.length > 48 ? `${line.slice(0, 48)}…` : line;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* fall through to comma split */
  }
  return String(value).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
}

const GOLD_CATEGORIES = ['milestone', 'identity', 'rule', 'relationship', 'emotion'];

function tierFor(source, category) {
  if (source === 'trigger_import' && GOLD_CATEGORIES.includes(category)) return 'gold';
  if (source === 'dream' && category === 'relationship_moment') return 'orange';
  return 'purple';
}

export async function getLmc5StarMap() {
  const db = client();
  if (!db) return { available: false, reason: 'not_configured' };

  try {
    const { rows } = await db.query(`
      SELECT id, content, source, category, e_initial_priority, weight, valence, arousal, response_tendency, topic_tag, created_at
      FROM lmc5_curated_memories
      ORDER BY created_at DESC
    `);

    const stars = rows.map((row) => {
      const content = String(row.content || '');
      const tier = tierFor(row.source, row.category);
      return {
        id: String(row.id),
        title: firstLine(content),
        summary: content.length > 180 ? `${content.slice(0, 180)}…` : content,
        pinned: tier === 'gold',
        domains: row.category ? [String(row.category)] : [],
        valence: Number(row.valence) || 0,
        arousal: Number(row.arousal) || 0,
        importance: Number(row.e_initial_priority) || 5,
        weight: Number(row.weight) || 1,
        tags: parseTags(row.response_tendency || row.topic_tag),
        source: row.source || null,
        category: row.category || null,
        tier,
        createdAt: row.created_at,
      };
    });

    const timeline = await listTimelineStars();
    for (const star of timeline.stars) stars.push(star);

    return {
      available: true,
      syncedAt: new Date().toISOString(),
      total: stars.length,
      stars,
      timeline: { available: timeline.available, reason: timeline.reason, count: timeline.stars.length },
      edges: [],
      stats: {
        pinned: stars.filter((s) => s.pinned).length,
        dynamic: stars.length,
        archived: 0,
        size: `${stars.length} 条`,
      },
    };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}

export async function getLmc5MemoryById(id) {
  const db = client();
  if (!db) return { available: false, reason: 'not_configured' };
  try {
    const rawId = String(id).startsWith('raw-') ? String(id).slice(4) : '';
    if (rawId) {
      const raw = await db.query(
        'SELECT id, content, created_at FROM lmc5_raw_events WHERE id = $1 LIMIT 1',
        [rawId]
      );
      if (!raw.rows.length) return { available: false, reason: 'not_found' };
      const row = raw.rows[0];
      const content = String(row.content || '');
      return {
        available: true,
        memory: { id: 'raw-' + row.id, content, title: firstLine(content), createdAt: row.created_at },
      };
    }
    const { rows } = await db.query(
      'SELECT id, content, e_initial_priority, weight, valence, arousal, category, response_tendency, topic_tag, created_at FROM lmc5_curated_memories WHERE id = $1 LIMIT 1',
      [String(id)]
    );
    if (!rows.length) return { available: false, reason: 'not_found' };
    const row = rows[0];
    const content = String(row.content || '');
    return {
      available: true,
      memory: {
        id: String(row.id),
        content,
        title: firstLine(content),
        importance: Number(row.e_initial_priority) || 5,
        domains: row.category ? [String(row.category)] : [],
        tags: parseTags(row.response_tendency || row.topic_tag),
        valence: Number(row.valence) || 0,
        arousal: Number(row.arousal) || 0,
        weight: Number(row.weight) || 1,
        createdAt: row.created_at,
      },
    };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}

export async function getLmc5RawEventById(id) {
  const db = client();
  if (!db) return { available: false, reason: 'not_configured' };
  try {
    const { rows } = await db.query(
      'SELECT id, session_id, role, channel, content, created_at FROM lmc5_raw_events WHERE id = $1 LIMIT 1',
      [String(id)]
    );
    if (!rows.length) return { available: false, reason: 'not_found' };
    const row = rows[0];
    return {
      available: true,
      event: {
        id: 'raw-' + row.id,
        sessionId: row.session_id,
        role: row.role,
        channel: row.channel,
        content: String(row.content || ''),
        createdAt: row.created_at,
      },
    };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}
