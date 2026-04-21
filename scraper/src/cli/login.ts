/**
 * Login script.
 * Opens a browser window for you to log into Threads manually.
 * The session is saved to ~/.threads-tracker/browser-profile/
 *
 * Usage: npm run login
 */

import { launchBrowser, isLoggedIn, waitForManualLogin } from '../agent/browser';
import { CONFIG } from '../config';

async function main() {
  console.log('🚀 Threads Tracker — Login');
  console.log(`   Profile dir: ${CONFIG.BROWSER_PROFILE_DIR}\n`);

  const { context, page } = await launchBrowser(false); // headful

  try {
    // Check if already logged in
    const alreadyLoggedIn = await isLoggedIn(page);
    if (alreadyLoggedIn) {
      console.log('✅ Already logged in! Session is valid.\n');
      console.log('   Press Enter to close the browser...');
      await new Promise<void>((resolve) => { process.stdin.once('data', () => resolve()); });
    } else {
      await waitForManualLogin(page);
      console.log('   Session saved. You can close this window.');
      console.log('   Next step: npm run test-scrape');
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
