/**
 * Login script.
 * Opens a browser window for you to log into Threads manually.
 * The session is saved to ~/.threads-tracker/browser-profile/
 *
 * Usage: npm run login
 */

import { launchBrowser } from '../agent/browser';
import { CONFIG } from '../config';

async function main() {
  console.log('🚀 Threads Tracker — Login');
  console.log(`   Profile dir: ${CONFIG.BROWSER_PROFILE_DIR}\n`);

  const { context, page } = await launchBrowser(false); // headful

  try {
    await page.goto(CONFIG.THREADS_HOME, { waitUntil: 'domcontentloaded' });

    console.log('   Check the browser window.');
    console.log('   Not logged in? Log in now, then come back here.\n');
    console.log('   Logged in and can see your feed?');
    console.log('   Press Enter to confirm  |  Ctrl+C to abort\n');

    await new Promise<void>(resolve => {
      process.stdin.once('data', () => { process.stdin.destroy(); resolve(); });
    });

    console.log('✅ Session confirmed. You\'re all set.\n');
    console.log('   Next step: npm run scraper:server');
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
