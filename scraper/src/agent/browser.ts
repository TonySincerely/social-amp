import { chromium, BrowserContext, Page } from 'playwright';
import { CONFIG } from '../config';

/**
 * Launch a persistent browser context.
 * The profile is saved to disk so login sessions survive restarts.
 */
export async function launchBrowser(
  headless: boolean = false
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(
    CONFIG.BROWSER_PROFILE_DIR,
    {
      headless,
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
    }
  );

  // Use existing page or create new one
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

/**
 * Navigate to Threads home and check if we're logged in.
 * Returns true if we see the feed, false if we see login page.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(CONFIG.THREADS_HOME, { waitUntil: 'domcontentloaded' });
  // Give the page a moment to settle and redirect if needed
  await page.waitForTimeout(3000);

  const url = page.url();
  // If we got redirected to login, we're not logged in
  if (url.includes('/login')) {
    return false;
  }

  // Check for feed content indicators
  try {
    await page.waitForSelector('[data-pressable-container=true]', {
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for manual login.
 * Opens the login page and waits for the user to complete login.
 */
export async function waitForManualLogin(page: Page): Promise<void> {
  console.log('\n🔐 Please log in to Threads in the browser window.');
  console.log('   After you see your feed, come back here and press Enter.\n');

  await page.goto(CONFIG.THREADS_HOME);

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  // Verify login worked
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    throw new Error(
      'Login verification failed. Make sure you can see your feed before pressing Enter.'
    );
  }

  console.log('✅ Login successful! Session saved.\n');
}

/**
 * Navigate to a Threads keyword search page and wait for results to appear.
 */
export async function navigateToSearch(page: Page, keyword: string): Promise<void> {
  const url = `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.waitForSelector('[data-pressable-container=true]', { timeout: 15000 });
}

/**
 * Random delay between min and max milliseconds
 */
export function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Scroll the page down by a random amount to trigger new content loading
 */
export async function scrollFeed(page: Page): Promise<void> {
  const scrollAmount = randomDelay(600, 1200);
  await page.evaluate((amount) => {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }, scrollAmount);

  const pause = randomDelay(CONFIG.SCROLL_PAUSE_MIN_MS, CONFIG.SCROLL_PAUSE_MAX_MS);
  await page.waitForTimeout(pause);
}
