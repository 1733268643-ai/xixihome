// 工具库：只读读取小雨的手机 App 使用记录。
// iOS 快捷指令负责写入 Supabase phone_activity；这里不提供任何写入/修改/删除能力。
import { createClient } from '@supabase/supabase-js';

const TABLE = 'phone_activity';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function getConfig() {
  return {
    url: process.env.PHONE_ACTIVITY_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.PHONE_ACTIVITY_SUPABASE_KEY || process.env.SUPABASE_KEY || '',
  };
}

function clampLimit(value) {
  const n = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function normalizeIso(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  const time = Date.parse(text);
  if (Number.isNaN(time)) {
    const err = new Error(`${fieldName} must be an ISO datetime`);
    err.status = 400;
    throw err;
  }
  return text;
}

export async function queryPhoneActivity({ limit, from, to } = {}) {
  const { url, key } = getConfig();
  if (!url || !key) {
    return { ok: false, error: 'missing phone activity supabase config' };
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const safeLimit = clampLimit(limit);
  const fromIso = normalizeIso(from, 'from');
  const toIso = normalizeIso(to, 'to');

  let query = client
    .from(TABLE)
    .select('app_name,opened_at')
    .order('opened_at', { ascending: false })
    .limit(safeLimit);

  if (fromIso) query = query.gte('opened_at', fromIso);
  if (toIso) query = query.lte('opened_at', toIso);

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    records: (data || []).map((row) => ({
      app_name: row.app_name,
      opened_at: row.opened_at,
    })),
  };
}
