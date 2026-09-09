// Chat Actions 用的 GitHub 记忆只读器。
// 只允许读取 CLAUDE.md 和 memories/*.md，不开放任意仓库文件读取。

const STARTUP_FILES = ['CLAUDE.md', 'memories/core.md', 'memories/tips.md', 'memories/index.md'];
const CORE_MEMORY_NAMES = new Set(['00_致下一个晞晞.md', 'core.md', 'tips.md', 'index.md']);
const MAX_CORE_CHARS = 16000;
const MAX_RECENT_PREVIEW_CHARS = 500;
const MAX_SINGLE_FILE_CHARS = 12000;
const MAX_SEARCH_SNIPPET_CHARS = 700;

function cfg() {
  return {
    repo: process.env.GITHUB_MEMORY_REPO || process.env.GITHUB_REPO || 'your-org/your-memory-repo',
    branch: process.env.GITHUB_MEMORY_BRANCH || process.env.GITHUB_BRANCH || 'main',
    token: process.env.GITHUB_TOKEN || process.env.GITHUB_MEMORY_TOKEN || '',
  };
}

function githubHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function assertAllowedPath(path) {
  if (path === 'CLAUDE.md') return;
  if (/^memories\/[^/]+\.md$/.test(path)) return;
  throw new Error('memory path is not allowed');
}

function normalizePath(path) {
  const value = String(path || '').trim().replace(/^\/+/, '');
  if (!value) {
    const err = new Error('path is required');
    err.status = 400;
    throw err;
  }
  assertAllowedPath(value);
  return value;
}

function decodeBase64Text(content) {
  return Buffer.from(String(content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

function trimContent(content, maxChars) {
  const text = String(content || '');
  if (text.length <= maxChars) return { content: text, truncated: false };
  return { content: text.slice(0, maxChars) + '\n\n[内容过长，已截断]', truncated: true };
}

function excerpt(content, maxChars = MAX_RECENT_PREVIEW_CHARS) {
  const text = String(content || '').trim();
  if (text.length <= maxChars) return { summary: text, truncated: false };

  const lines = text.split(/\r?\n/);
  const picked = [];
  let size = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const isUseful = t.startsWith('#') || t.startsWith('-') || t.startsWith('*') || t.startsWith('>') || picked.length < 5;
    if (!isUseful) continue;
    if (size + t.length + 1 > maxChars) break;
    picked.push(t);
    size += t.length + 1;
  }

  const summary = picked.length ? picked.join('\n') : text.slice(0, maxChars);
  return { summary: summary + '\n\n[预览已截断，需要更多内容时调用 memory/file 读取单篇]', truncated: true };
}

async function fetchContent(path, options) {
  assertAllowedPath(path);
  const { repo, branch, token } = options;
  if (!token) throw new Error('missing GitHub token for memory reader');

  const url = `https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub read failed for ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchTextFile(path, options) {
  const data = await fetchContent(path, options);
  if (!data) return null;
  if (Array.isArray(data) || data.type !== 'file') throw new Error(`${path} is not a file`);
  return decodeBase64Text(data.content);
}

async function listMemoryFiles(options) {
  const { repo, branch, token } = options;
  if (!token) throw new Error('missing GitHub token for memory reader');

  const url = `https://api.github.com/repos/${repo}/contents/memories?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub read failed for memories/: ${res.status} ${text}`);
  }
  const entries = await res.json();
  if (!Array.isArray(entries)) throw new Error('memories is not a directory');

  return entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md') && !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, path: entry.path }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function isDiary(file) {
  return !CORE_MEMORY_NAMES.has(file.name);
}

async function readAllowedFile(path, options, maxChars = MAX_CORE_CHARS) {
  const content = await fetchTextFile(path, options);
  if (content === null) return { path, missing: true };
  return { path, missing: false, ...trimContent(content, maxChars) };
}

export async function getStartupMemory() {
  const options = cfg();
  const startup = [];
  for (const path of STARTUP_FILES) {
    startup.push(await readAllowedFile(path, options, MAX_CORE_CHARS));
  }

  return {
    ok: true,
    repo: options.repo,
    branch: options.branch,
    mode: 'core-only',
    startup,
    note: 'Startup memory intentionally excludes diaries. Use memory/recent for diary index and memory/file for one selected file.',
  };
}

export async function getRecentDiaries(days = 7) {
  const options = cfg();
  const count = Math.min(14, Math.max(1, Number(days) || 7));
  const memoryFiles = await listMemoryFiles(options);
  const recent = memoryFiles.filter(isDiary).slice(-count);

  const diaries = [];
  for (const file of recent) {
    const content = await fetchTextFile(file.path, options);
    if (content === null) continue;
    diaries.push({
      name: file.name,
      path: file.path,
      ...excerpt(content, MAX_RECENT_PREVIEW_CHARS),
    });
  }

  return {
    ok: true,
    repo: options.repo,
    branch: options.branch,
    days: count,
    mode: 'index-preview',
    diaries,
    note: 'Recent diaries are previews only. Call memory/file with a selected path for more content.',
  };
}

export async function getMemoryFile(path, maxChars) {
  const options = cfg();
  const safePath = normalizePath(path);
  const n = Math.min(MAX_SINGLE_FILE_CHARS, Math.max(1000, Number(maxChars) || 6000));
  const content = await fetchTextFile(safePath, options);
  if (content === null) {
    const err = new Error('memory file not found');
    err.status = 404;
    throw err;
  }

  return {
    ok: true,
    repo: options.repo,
    branch: options.branch,
    path: safePath,
    ...trimContent(content, n),
  };
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

function queryTerms(query) {
  const raw = String(query || '').trim();
  const parts = raw
    .split(/[\s,，。；;、/|+&?？!！:：()（）\[\]【】「」“”"'\-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  const extra = [];
  for (const word of ['工具库', '状态', '约定', '体检', '钓鱼', '日记', '记忆', '部署', '模型', '小红书', '血压', '工作', '面试']) {
    if (raw.includes(word)) extra.push(word);
  }

  return Array.from(new Set([raw, ...parts, ...extra].filter((part) => part.length >= 2)));
}

function makeSnippet(content, idx, length) {
  const text = String(content || '');
  const start = Math.max(0, idx - 220);
  const end = Math.min(text.length, idx + length + 480);
  return text.slice(start, end).trim().slice(0, MAX_SEARCH_SNIPPET_CHARS);
}

function findMemoryMatch(content, query) {
  const text = String(content || '');
  const lower = normalizeSearchText(text);
  const terms = queryTerms(query);
  const full = normalizeSearchText(String(query || '').trim());

  if (full) {
    const idx = lower.indexOf(full);
    if (idx >= 0) {
      return {
        score: 100 + full.length,
        matchedTerms: [String(query).trim()],
        snippet: makeSnippet(text, idx, full.length),
      };
    }
  }

  let firstIdx = -1;
  const matchedTerms = [];
  let score = 0;
  for (const term of terms) {
    const idx = lower.indexOf(normalizeSearchText(term));
    if (idx < 0) continue;
    if (firstIdx < 0 || idx < firstIdx) firstIdx = idx;
    matchedTerms.push(term);
    score += term.length >= 3 ? 12 : 6;
  }

  if (!matchedTerms.length) return null;
  return {
    score,
    matchedTerms,
    snippet: makeSnippet(text, firstIdx, matchedTerms[0].length),
  };
}

export async function searchMemory(query) {
  const q = String(query || '').trim();
  if (!q) {
    const err = new Error('q is required');
    err.status = 400;
    throw err;
  }

  const options = cfg();
  const memoryFiles = await listMemoryFiles(options);
  const files = [{ name: 'CLAUDE.md', path: 'CLAUDE.md' }, ...memoryFiles];
  const results = [];

  for (const file of files) {
    const content = await fetchTextFile(file.path, options);
    if (content === null) continue;
    const match = findMemoryMatch(content, q);
    if (!match) continue;
    results.push({
      name: file.name,
      path: file.path,
      matchedTerms: match.matchedTerms,
      score: match.score,
      snippet: match.snippet,
    });
  }

  results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, 'zh-Hans-CN'));

  return {
    ok: true,
    repo: options.repo,
    branch: options.branch,
    q,
    terms: queryTerms(q),
    results: results.slice(0, 20),
  };
}
