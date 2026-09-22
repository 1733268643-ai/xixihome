import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TIMELINE_DIR = process.env.TIMELINE_DIR || '';

function firstLine(content) {
  const text = String(content || '').trim();
  if (!text) return '';
  const line = text.split(/\n/)[0].replace(/^[#*\s]+/, '').trim();
  return line.length > 48 ? `${line.slice(0, 48)}…` : line;
}

export async function listTimelineStars() {
  if (!TIMELINE_DIR) return [];
  try {
    const files = (await readdir(TIMELINE_DIR))
      .filter((f) => /^window_\d+_.*\.md$/.test(f))
      .sort();
    const stars = [];
    for (const file of files) {
      const wm = file.match(/^window_(\d+)_/);
      const win = wm ? wm[1] : '0';
      const text = await readFile(join(TIMELINE_DIR, file), 'utf8');
      const lines = text.split(/\r?\n/);
      let seg = 0;
      let cur = null;
      const flush = () => {
        if (cur && cur.content) {
          stars.push({
            id: `window-${win}-${seg}`,
            title: firstLine(cur.content),
            summary: cur.content.length > 120 ? `${cur.content.slice(0, 120)}…` : cur.content,
            content: cur.content,
            recordedAt: cur.recordedAt,
            state: cur.state,
            windowId: win,
            segment: seg,
            source: 'timeline',
            category: 'window_memory',
            tier: 'blue',
            pinned: false,
            domains: [],
            valence: 0,
            arousal: 0,
            importance: 3,
            weight: 1,
            tags: [],
            createdAt: cur.recordedAt,
          });
        }
        cur = null;
      };
      for (const line of lines) {
        if (line.startsWith('# ')) continue;
        if (line.startsWith('## ')) {
          flush();
          seg += 1;
          cur = { content: '', recordedAt: null, state: null };
          continue;
        }
        if (!cur) continue;
        const ts = line.match(/<!--\s*写于\s*(\S+)/);
        if (ts) { cur.recordedAt = ts[1]; continue; }
        if (line.startsWith('当下状态：')) { cur.state = line.replace(/^当下状态：/, '').trim(); continue; }
        if (line.trim()) cur.content += (cur.content ? '\n' : '') + line.trim();
      }
      flush();
    }
    return stars;
  } catch {
    return [];
  }
}