/**
 * One-time Twitter/X login.
 * Opens a browser window so you can log in manually.
 * Session saved to ~/.twitter-tracker/browser-profile/
 *
 * Usage: npm run twitter:login
 */

import { launchBrowser } from '../agent/browser';
import { CONFIG } from '../config';

async function main() {
  console.log('🐦 Twitter Tracker — Login');
  console.log(`   Profile dir: ${CONFIG.TWITTER_BROWSER_PROFILE_DIR}\n`);

  const { context, page } = await launchBrowser(false, CONFIG.TWITTER_BROWSER_PROFILE_DIR);

  try {
    await page.goto(CONFIG.TWITTER_HOME, { waitUntil: 'domcontentloaded' });

    console.log('   Check the browser window.');
    console.log('   Not logged in? Log in now, then come back here.\n');
    console.log('   Logged in and can see your home feed?');
    console.log('   Press Enter to confirm  |  Ctrl+C to abort\n');

    await new Promise<void>(resolve => {
      process.stdin.once('data', () => { process.stdin.destroy(); resolve(); });
    });

    console.log('✅ Session confirmed. You\'re all set.\n');
    console.log('   Next step: npm run twitter:test');
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
