import { Page, BrowserContext } from 'playwright';
import { CONFIG } from '../config';
import { launchBrowser, randomDelay } from './browser';

export async function launchTwitterBrowser(
  headless = false
): Promise<{ context: BrowserContext; page: Page }> {
  return launchBrowser(headless, CONFIG.TWITTER_BROWSER_PROFILE_DIR);
}

export async function isTwitterLoggedIn(page: Page): Promise<boolean> {
  await page.goto(CONFIG.TWITTER_HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const url = page.url();
  return url.includes('x.com') && !url.includes('/login') && !url.includes('/i/flow');
}

export async function navigateToTwitterHome(page: Page): Promise<void> {
  await page.goto(CONFIG.TWITTER_HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

export async function navigateToTwitterSearch(page: Page, keyword: string): Promise<void> {
  const url = `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query`;

  // X is a React SPA — direct goto to search is unreliable; the client-side router
  // sometimes redirects to /home during SPA boot. Landing on /home first ensures
  // the app is fully initialised before we push the search route.
  const currentUrl = page.url();
  if (!currentUrl.includes('x.com/home') && !currentUrl.includes('x.com/search')) {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Retry once if we still ended up on /home
  if (!page.url().includes('/search')) {
    console.log('  ⚠️  Redirected to /home — retrying search navigation...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

export async function navigateToTwitterProfile(page: Page, username: string): Promise<void> {
  await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

export async function scrollTwitterFeed(page: Page): Promise<void> {
  const amount = randomDelay(600, 1200);
  await page.evaluate((amt) => {
    window.scrollBy({ top: amt, behavior: 'smooth' });
  }, amount);
  await page.waitForTimeout(
    randomDelay(CONFIG.TWITTER_SCROLL_PAUSE_MIN_MS, CONFIG.TWITTER_SCROLL_PAUSE_MAX_MS)
  );
}
