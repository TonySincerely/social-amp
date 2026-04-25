import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// Load env so SUPABASE_* vars are available when spawning child processes
import './config';

function findTsNodeBin(scraperDir: string): string {
  const candidates = [
    path.join(scraperDir, 'node_modules', 'ts-node', 'dist', 'bin.js'),
    path.join(scraperDir, '..', 'node_modules', 'ts-node', 'dist', 'bin.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('ts-node not found in scraper or root node_modules');
}

const app = express();
app.use(cors());
app.use(express.json());

// ── Threads process state ────────────────────────────────────────────────────
let scraperProcess: ChildProcess | null = null;
let currentKeyword: string | null = null;
const logBuffer: string[] = [];
const MAX_BUFFER = 200;
const sseClients = new Set<express.Response>();

function broadcast(line: string) {
  const clean = line.trimEnd();
  if (!clean) return;
  logBuffer.push(clean);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify(clean)}\n\n`);
  }
}

// ── Twitter process state ─────────────────────────────────────────────────────
let twitterProcess: ChildProcess | null = null;
let twitterMode: string | null = null;  // null | 'home' | 'search'
const twitterLogBuffer: string[] = [];
const twitterSseClients = new Set<express.Response>();

function broadcastTwitter(line: string) {
  const clean = line.trimEnd();
  if (!clean) return;
  twitterLogBuffer.push(clean);
  if (twitterLogBuffer.length > MAX_BUFFER) twitterLogBuffer.shift();
  for (const res of twitterSseClients) {
    res.write(`data: ${JSON.stringify(clean)}\n\n`);
  }
}

app.get('/api/threads/status', (_req, res) => {
  res.json({ running: scraperProcess !== null, pid: scraperProcess?.pid ?? null, keyword: currentKeyword });
});

app.post('/api/threads/start', (_req, res) => {
  if (scraperProcess) {
    res.status(409).json({ error: 'Already running' });
    return;
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  currentKeyword = null;
  scraperProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/start.ts'], {
    cwd: scraperDir,
    env: { ...process.env, SINGLE_RUN: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  scraperProcess.stdout?.on('data', (d: Buffer) => broadcast(d.toString()));
  scraperProcess.stderr?.on('data', (d: Buffer) => broadcast(d.toString()));
  scraperProcess.on('exit', () => {
    scraperProcess = null;
    currentKeyword = null;
    broadcast('[scraper stopped]');
  });

  broadcast('[scraper starting...]');
  res.json({ started: true, pid: scraperProcess.pid });
});

app.post('/api/threads/search', async (req, res) => {
  const keyword = ((req.body.keyword as string) || '').trim();
  if (!keyword) {
    res.status(400).json({ error: 'keyword is required' });
    return;
  }

  if (scraperProcess) {
    await new Promise<void>(resolve => {
      scraperProcess!.once('exit', resolve);
      scraperProcess!.kill('SIGTERM');
    });
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  currentKeyword = keyword;
  scraperProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/search.ts'], {
    cwd: scraperDir,
    env: { ...process.env, KEYWORD: keyword },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  scraperProcess.stdout?.on('data', (d: Buffer) => broadcast(d.toString()));
  scraperProcess.stderr?.on('data', (d: Buffer) => broadcast(d.toString()));
  scraperProcess.on('exit', () => {
    scraperProcess = null;
    currentKeyword = null;
    broadcast(`[search complete: "${keyword}"]`);
  });

  broadcast(`[keyword search starting: "${keyword}"]`);
  res.json({ started: true, keyword, pid: scraperProcess.pid });
});

app.post('/api/threads/stop', (_req, res) => {
  if (!scraperProcess) {
    res.status(409).json({ error: 'Not running' });
    return;
  }
  scraperProcess.kill('SIGTERM');
  res.json({ stopped: true });
});

app.get('/api/threads/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  for (const line of logBuffer) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Twitter routes ───────────────────────────────────────────────────────────

app.get('/api/twitter/status', (_req, res) => {
  res.json({ running: twitterProcess !== null, pid: twitterProcess?.pid ?? null, mode: twitterMode });
});

app.post('/api/twitter/start', (_req, res) => {
  if (twitterProcess) {
    res.status(409).json({ error: 'Already running' });
    return;
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  twitterMode = 'home';
  twitterProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/twitter-start.ts'], {
    cwd: scraperDir,
    env: { ...process.env, SINGLE_RUN: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  twitterProcess.stdout?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.stderr?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.on('exit', () => {
    twitterProcess = null;
    twitterMode    = null;
    broadcastTwitter('[twitter scraper stopped]');
  });

  broadcastTwitter('[twitter scraper starting...]');
  res.json({ started: true, pid: twitterProcess.pid });
});

app.post('/api/twitter/search', async (req, res) => {
  const keyword = ((req.body.keyword as string) || '').trim();
  if (!keyword) {
    res.status(400).json({ error: 'keyword is required' });
    return;
  }

  if (twitterProcess) {
    await new Promise<void>(resolve => {
      twitterProcess!.once('exit', resolve);
      twitterProcess!.kill('SIGTERM');
    });
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  twitterMode = 'search';
  twitterProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/twitter-search.ts'], {
    cwd: scraperDir,
    env: { ...process.env, KEYWORD: keyword },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  twitterProcess.stdout?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.stderr?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.on('exit', () => {
    twitterProcess = null;
    twitterMode    = null;
    broadcastTwitter(`[search complete: "${keyword}"]`);
  });

  broadcastTwitter(`[keyword search starting: "${keyword}"]`);
  res.json({ started: true, keyword, pid: twitterProcess.pid });
});

app.post('/api/twitter/accounts', (_req, res) => {
  if (twitterProcess) {
    res.status(409).json({ error: 'Already running' });
    return;
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  twitterMode = 'accounts';
  twitterProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/twitter-accounts.ts'], {
    cwd: scraperDir,
    env: { ...process.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  twitterProcess.stdout?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.stderr?.on('data', (d: Buffer) => broadcastTwitter(d.toString()));
  twitterProcess.on('exit', () => {
    twitterProcess = null;
    twitterMode    = null;
    broadcastTwitter('[account scrape complete]');
  });

  broadcastTwitter('[account scrape starting...]');
  res.json({ started: true, pid: twitterProcess.pid });
});

app.post('/api/twitter/stop', (_req, res) => {
  if (!twitterProcess) {
    res.status(409).json({ error: 'Not running' });
    return;
  }
  twitterProcess.kill('SIGTERM');
  res.json({ stopped: true });
});

app.get('/api/twitter/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  for (const line of twitterLogBuffer) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  twitterSseClients.add(res);
  req.on('close', () => twitterSseClients.delete(res));
});

// ── Booster profile process state ────────────────────────────────────────────
let boosterProcess: ChildProcess | null = null;
let boosterHandle: string | null = null;
const boosterLogBuffer: string[] = [];
const boosterSseClients = new Set<express.Response>();

function broadcastBooster(line: string) {
  const clean = line.trimEnd();
  if (!clean) return;
  boosterLogBuffer.push(clean);
  if (boosterLogBuffer.length > MAX_BUFFER) boosterLogBuffer.shift();
  for (const res of boosterSseClients) {
    res.write(`data: ${JSON.stringify(clean)}\n\n`);
  }
}

app.get('/api/booster/profile/status', (_req, res) => {
  res.json({ running: boosterProcess !== null, pid: boosterProcess?.pid ?? null, handle: boosterHandle });
});

app.post('/api/booster/profile/scrape', async (req, res) => {
  const handle        = ((req.body.handle as string) || '').trim().replace(/^@/, '');
  const postsTarget   = parseInt((req.body.postsTarget   as string) || '50', 10);
  const repliesTarget = parseInt((req.body.repliesTarget as string) || '0',  10);

  if (!handle) {
    res.status(400).json({ error: 'handle is required' });
    return;
  }
  if (boosterProcess) {
    res.status(409).json({ error: 'Scrape already running' });
    return;
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  boosterHandle  = `@${handle}`;
  boosterProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/profile-scrape.ts'], {
    cwd:   scraperDir,
    env:   { ...process.env, HANDLE: handle, POSTS_TARGET: String(postsTarget), REPLIES_TARGET: String(repliesTarget) },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  boosterProcess.stdout?.on('data', (d: Buffer) => broadcastBooster(d.toString()));
  boosterProcess.stderr?.on('data', (d: Buffer) => broadcastBooster(d.toString()));
  boosterProcess.on('exit', (code) => {
    boosterProcess = null;
    boosterHandle  = null;
    broadcastBooster(code === 0 ? '[scrape complete]' : `[scrape exited: code ${code}]`);
  });

  broadcastBooster(`[profile scrape starting: @${handle}]`);
  res.json({ started: true, handle: `@${handle}`, pid: boosterProcess.pid });
});

app.post('/api/booster/profile/stop', (_req, res) => {
  if (!boosterProcess) {
    res.status(409).json({ error: 'Not running' });
    return;
  }
  boosterProcess.kill('SIGTERM');
  res.json({ stopped: true });
});

app.get('/api/booster/profile/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  for (const line of boosterLogBuffer) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  boosterSseClients.add(res);
  req.on('close', () => boosterSseClients.delete(res));
});

// ── Booster Threads API fetch process state ───────────────────────────────────
let apiFetchProcess: ChildProcess | null = null;
const apiFetchLogBuffer: string[] = [];
const apiFetchSseClients = new Set<express.Response>();

function broadcastApiFetch(line: string) {
  const clean = line.trimEnd();
  if (!clean) return;
  apiFetchLogBuffer.push(clean);
  if (apiFetchLogBuffer.length > MAX_BUFFER) apiFetchLogBuffer.shift();
  for (const res of apiFetchSseClients) {
    res.write(`data: ${JSON.stringify(clean)}\n\n`);
  }
}

app.get('/api/booster/api-fetch/status', (_req, res) => {
  res.json({ running: apiFetchProcess !== null, pid: apiFetchProcess?.pid ?? null });
});

app.post('/api/booster/api-fetch/start', async (req, res) => {
  const handle = ((req.body.handle as string) || '').trim().replace(/^@/, '');
  const token  = ((req.body.token  as string) || '').trim();
  const limit  = parseInt((req.body.limit  as string) || '200', 10);

  if (!handle || !token) {
    res.status(400).json({ error: 'handle and token are required' });
    return;
  }
  if (apiFetchProcess) {
    res.status(409).json({ error: 'Already running' });
    return;
  }

  const scraperDir = path.join(__dirname, '..');
  const tsNodeBin  = findTsNodeBin(scraperDir);

  apiFetchProcess = spawn(process.execPath, [tsNodeBin, 'src/cli/threads-api-fetch.ts'], {
    cwd:   scraperDir,
    env:   { ...process.env, HANDLE: handle, TOKEN: token, LIMIT: String(limit) },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  apiFetchProcess.stdout?.on('data', (d: Buffer) => broadcastApiFetch(d.toString()));
  apiFetchProcess.stderr?.on('data', (d: Buffer) => broadcastApiFetch(d.toString()));
  apiFetchProcess.on('exit', (code) => {
    apiFetchProcess = null;
    broadcastApiFetch(code === 0 ? '[fetch complete]' : `[fetch exited: code ${code}]`);
  });

  broadcastApiFetch(`[threads api fetch starting: @${handle}]`);
  res.json({ started: true, handle: `@${handle}`, pid: apiFetchProcess.pid });
});

app.post('/api/booster/api-fetch/stop', (_req, res) => {
  if (!apiFetchProcess) { res.status(409).json({ error: 'Not running' }); return; }
  apiFetchProcess.kill('SIGTERM');
  res.json({ stopped: true });
});

app.get('/api/booster/api-fetch/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  for (const line of apiFetchLogBuffer) res.write(`data: ${JSON.stringify(line)}\n\n`);
  apiFetchSseClients.add(res);
  req.on('close', () => apiFetchSseClients.delete(res));
});

// ── Server start ─────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Scraper API server running on http://localhost:${PORT}`);
  console.log(`  Threads: /api/threads/*`);
  console.log(`  Twitter: /api/twitter/*`);
  console.log(`  Booster: /api/booster/profile/* + /api/booster/api-fetch/*`);
});
