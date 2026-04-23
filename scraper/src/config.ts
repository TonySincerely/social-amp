import * as dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Load scraper/.env before anything else reads process.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BROWSER_PROFILE_DIR         = path.join(os.homedir(), '.threads-tracker', 'browser-profile');
const RAW_DUMP_DIR                 = path.join(os.homedir(), '.threads-tracker', 'raw-dumps');
const TWITTER_BROWSER_PROFILE_DIR = path.join(os.homedir(), '.twitter-tracker', 'browser-profile');
const TWITTER_RAW_DUMP_DIR        = path.join(os.homedir(), '.twitter-tracker', 'raw-dumps');

for (const dir of [BROWSER_PROFILE_DIR, RAW_DUMP_DIR, TWITTER_BROWSER_PROFILE_DIR, TWITTER_RAW_DUMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const CONFIG = {
  BROWSER_PROFILE_DIR,
  RAW_DUMP_DIR,

  THREADS_HOME:  'https://www.threads.net',
  THREADS_LOGIN: 'https://www.threads.net/login',

  TWITTER_BROWSER_PROFILE_DIR,
  TWITTER_RAW_DUMP_DIR,
  TWITTER_HOME:  'https://x.com',
  TWITTER_LOGIN: 'https://x.com/login',

  // Threads timing
  SCROLL_PAUSE_MIN_MS: 2000,
  SCROLL_PAUSE_MAX_MS: 5000,
  POLL_INTERVAL_MIN_MS: 5  * 60 * 1000,
  POLL_INTERVAL_MAX_MS: 15 * 60 * 1000,

  // Twitter timing — longer intervals, Twitter is more aggressive
  TWITTER_SCROLL_PAUSE_MIN_MS: 2500,
  TWITTER_SCROLL_PAUSE_MAX_MS: 6000,
  TWITTER_POLL_INTERVAL_MIN_MS: 8  * 60 * 1000,
  TWITTER_POLL_INTERVAL_MAX_MS: 20 * 60 * 1000,

  VIEWPORT:   { width: 1280, height: 900 },
  USER_AGENT: undefined as string | undefined,
};
