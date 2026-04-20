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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Threads API server running on http://localhost:${PORT}`);
});
