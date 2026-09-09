// 从 GitHub main 拉取最新人格和记忆到当前部署实例。
// 用于 Codex 写入 memories/ 后，让 Pai's Home 不必重新部署也能刷新记忆。
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

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

async function fetchContent(path, options) {
  const { repo, branch, token } = options;
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub 读取 ${path} 失败 ${res.status}: ${text}`);
  }
  return res.json();
}

function encodeURIComponentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeBase64Text(content) {
  return Buffer.from(String(content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

async function fetchTextFile(path, options) {
  const data = await fetchContent(path, options);
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`${path} 不是文件`);
  }
  return decodeBase64Text(data.content);
}

async function fetchMemoryFiles(options) {
  const entries = await fetchContent('memories', options);
  if (!Array.isArray(entries)) throw new Error('memories 不是目录');

  const files = entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md') && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  const out = [];
  for (const file of files) {
    out.push({ name: file.name, content: await fetchTextFile(file.path, options) });
  }
  return out;
}

export async function syncGitHubMemory() {
  const options = cfg();
  if (!options.token) {
    throw new Error('缺少 GITHUB_TOKEN。私有仓库需要在 Render 环境变量里配置一个只读 token。');
  }

  const claude = await fetchTextFile('CLAUDE.md', options);
  const memories = await fetchMemoryFiles(options);

  await writeFile(join(REPO_ROOT, 'CLAUDE.md'), claude, 'utf8');

  const memoryDir = join(REPO_ROOT, 'memories');
  await rm(memoryDir, { recursive: true, force: true });
  await mkdir(memoryDir, { recursive: true });

  for (const file of memories) {
    await writeFile(join(memoryDir, file.name), file.content, 'utf8');
  }

  return {
    repo: options.repo,
    branch: options.branch,
    files: ['CLAUDE.md', ...memories.map((file) => `memories/${file.name}`)],
  };
}
