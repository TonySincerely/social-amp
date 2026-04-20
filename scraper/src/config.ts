import * as dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Load scraper/.env before anything else reads process.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BROWSER_PROFILE_DIR = path.join(os.homedir(), '.threads-tracker', 'browser-profile');
const RAW_DUMP_DIR        = path.join(os.homedir(), '.threads-tracker', 'raw-dumps');

for (const dir of [BROWSER_PROFILE_DIR, RAW_DUMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const CONFIG = {
  BROWSER_PROFILE_DIR,
  RAW_DUMP_DIR,

  THREADS_HOME:  'https://www.threads.net',
  THREADS_LOGIN: 'https://www.threads.net/login',

  SCROLL_PAUSE_MIN_MS: 2000,
  SCROLL_PAUSE_MAX_MS: 5000,
  POLL_INTERVAL_MIN_MS: 5  * 60 * 1000,
  POLL_INTERVAL_MAX_MS: 15 * 60 * 1000,

  VIEWPORT:   { width: 1280, height: 900 },
  USER_AGENT: undefined as string | undefined,
};
