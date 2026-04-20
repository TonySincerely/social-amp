/**
 * Dump raw data — saves the hidden JSON datasets to files for debugging.
 * Use this when test-scrape finds 0 posts, to inspect the actual data format.
 *
 * Output goes to ~/.threads-tracker/raw-dumps/
 *
 * Usage: npm run dump-raw
 */

import fs from 'fs';
import path from 'path';
import { launchBrowser, isLoggedIn } from '../agent/browser';
import { extractRawDatasets } from '../agent/parser';
import { CONFIG } from '../config';

async function main() {
  console.log('🔬 Threads Tracker — Dump Raw Data');
  console.log(`   Output dir: ${CONFIG.RAW_DUMP_DIR}\n`);

  const { context, page } = await launchBrowser(false);

  try {
    console.log('⏳ Loading feed...');
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.error('❌ Not logged in. Run `npm run login` first.');
      return;
    }

    await page.waitForTimeout(8000);
    console.log('🔍 Extracting hidden datasets...\n');

    // Use page.evaluate for reliable DOM access
    const scriptContents = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/json"][data-sjs]');
      return Array.from(scripts).map(s => s.textContent || '');
    });

    console.log(`   Found ${scriptContents.length} data-sjs script tags in DOM`);
    console.log(`   With "thread_items": ${scriptContents.filter(s => s.includes('thread_items')).length}`);
    console.log(`   With "taken_at": ${scriptContents.filter(s => s.includes('taken_at')).length}\n`);

    // Save full HTML for inspection
    const html = await page.content();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const htmlPath = path.join(CONFIG.RAW_DUMP_DIR, `page-${timestamp}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`   📄 Full HTML saved: ${htmlPath} (${(html.length / 1024).toFixed(0)}KB)`);

    // Extract and save thread_items datasets
    const datasets = extractRawDatasets(scriptContents);

    if (datasets.length === 0) {
      console.log('\n⚠️  No thread_items datasets found!');
      console.log('');
      console.log('   Debugging steps:');
      console.log('   1. Open the saved HTML file in a text editor');
      console.log('   2. Search for <script.*data-sjs');
      console.log('   3. If no matches, the attribute name may have changed');
      console.log('   4. Search for "thread_items" or "taken_at" to find the data');
      console.log('   5. Share the script tag structure with me and I\'ll update the parser');

      // Also try to find ANY script tags with JSON data
      const anyScripts = html.match(/<script[^>]*type="application\/json"[^>]*>/gi);
      if (anyScripts) {
        console.log(`\n   Found ${anyScripts.length} JSON script tags total.`);
        console.log('   First few tag attributes:');
        for (const tag of anyScripts.slice(0, 5)) {
          console.log(`     ${tag}`);
        }
      } else {
        console.log('\n   No JSON script tags found at all. Page may not have loaded.');
      }
    } else {
      for (let i = 0; i < datasets.length; i++) {
        const dataPath = path.join(CONFIG.RAW_DUMP_DIR, `thread-items-${timestamp}-${i}.json`);
        const jsonStr = JSON.stringify(datasets[i], null, 2);
        fs.writeFileSync(dataPath, jsonStr);
        console.log(`   📦 Dataset ${i}: ${dataPath} (${(jsonStr.length / 1024).toFixed(0)}KB)`);

        // Print a preview of the first item
        const firstItems = datasets[i].thread_items?.[0];
        if (Array.isArray(firstItems) && firstItems.length > 0) {
          const firstItem = firstItems[0];
          console.log(`      First item keys: ${Object.keys(firstItem).join(', ')}`);
          if (firstItem.post) {
            console.log(`      post keys: ${Object.keys(firstItem.post).join(', ')}`);
            if (firstItem.post.user) {
              console.log(`      post.user keys: ${Object.keys(firstItem.post.user).join(', ')}`);
            }
            if (firstItem.post.caption) {
              console.log(`      post.caption keys: ${Object.keys(firstItem.post.caption).join(', ')}`);
              const text = firstItem.post.caption.text;
              if (text) {
                console.log(`      post.caption.text: "${text.substring(0, 80)}..."`);
              }
            }
            console.log(`      post.taken_at: ${firstItem.post.taken_at}`);
            console.log(`      post.pk: ${firstItem.post.pk}`);
            console.log(`      post.like_count: ${firstItem.post.like_count}`);
          }
        }
      }

      console.log(`\n✅ Found ${datasets.length} dataset(s) with thread_items.`);
      console.log('   Inspect the JSON files to verify field mappings.');
    }

  } finally {
    console.log('\n   Press Enter to close browser...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
