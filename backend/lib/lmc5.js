import pg from 'pg';

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

export async function getLmc5StarMap() {
  const db = client();
  if (!db) return { available: false, reason: 'not_configured' };

  try {
    const { rows } = await db.query(`
      SELECT id, content, importance, category, emotion_tags, created_at
      FROM lmc5_curated_memories
      ORDER BY created_at DESC
    `);

    const stars = rows.map((row) => {
      const content = String(row.content || '');
      const importance = Number(row.importance) || 5;
      const tags = parseTags(row.emotion_tags);
      return {
        id: String(row.id),
        title: firstLine(content),
        summary: content.length > 180 ? `${content.slice(0, 180)}…` : content,
        pinned: false,
        domains: row.category ? [String(row.category)] : [],
        valence: 0,
        arousal: 0,
        importance,
        weight: importance,
        tags,
        createdAt: row.created_at,
      };
    });

    return {
      available: true,
      syncedAt: new Date().toISOString(),
      total: stars.length,
      stars,
      edges: [],
      stats: {
        pinned: 0,
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
    const { rows } = await db.query(
      'SELECT id, content, importance, category, emotion_tags, created_at FROM lmc5_curated_memories WHERE id = $1 LIMIT 1',
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
        importance: Number(row.importance) || 5,
        domains: row.category ? [String(row.category)] : [],
        tags: parseTags(row.emotion_tags),
        createdAt: row.created_at,
      },
    };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}
