import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync } from 'fs';

puppeteer.use(stealth());

const BASE_URL = 'https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci/';
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_DELAY = 1500;
const DEFAULT_OUTPUT = 'listings.json';
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
let maxPages = DEFAULT_MAX_PAGES;
let delay = DEFAULT_DELAY;
let outputFile = DEFAULT_OUTPUT;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pages' && args[i + 1]) {
    maxPages = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--delay' && args[i + 1]) {
    delay = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  }
}

const listings = new Map();

async function scrapePage(page, pageNum) {
  const url = pageNum === 1
    ? `${BASE_URL}?courier=1`
    : `${BASE_URL}?courier=1&page=${pageNum}`;

  console.log(`\n[Page ${pageNum}/${maxPages}] Loading: ${url}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForSelector('div[data-cy="ad-card-title"]', { timeout: 10000 });

      const pageListings = await page.evaluate(() => {
        const cards = document.querySelectorAll('div[data-cy="ad-card-title"]');
        const results = [];

        cards.forEach(card => {
          const titleEl = card.querySelector('h4[data-nx-name="H4"]');
          const linkEl = card.querySelector('a[href*="/d/oferta/"]');
          const priceEl = card.querySelector('[data-testid="ad-price"]');

          const title = titleEl ? titleEl.textContent.trim() : null;
          const href = linkEl ? linkEl.getAttribute('href') : null;
          const price = priceEl ? priceEl.textContent.trim().replace(/\s{2,}/g, ' ').replace(/zł(\w)/g, 'zł $1') : 'N/A';

          if (title && href) {
            let url = href.startsWith('http') ? href : `https://www.olx.pl${href}`;
            results.push({ title, url, price });
          }
        });

        return results;
      });

      let newCount = 0;
      pageListings.forEach(listing => {
        if (!listings.has(listing.url)) {
          listings.set(listing.url, listing);
          newCount++;
        }
      });

      console.log(`[Page ${pageNum}] Found ${pageListings.length} listings, ${newCount} new. Total: ${listings.size}`);

      if (pageListings.length === 0) {
        console.warn(`[Page ${pageNum}] WARNING: No listings found. Possible anti-bot detection.`);
      }

      return true;
    } catch (err) {
      console.error(`[Page ${pageNum}] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.error(`[Page ${pageNum}] FAILED after ${MAX_RETRIES} attempts`);
  return false;
}

async function main() {
  console.log('=== OLX PC Parts Scraper ===');
  console.log(`Max pages: ${maxPages}, Delay: ${delay}ms, Output: ${outputFile}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let successCount = 0;
  let failCount = 0;

  for (let p = 1; p <= maxPages; p++) {
    const success = await scrapePage(page, p);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    if (p < maxPages) {
      console.log(`Waiting ${delay}ms before next page...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await browser.close();

  const results = Array.from(listings.values());
  writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Pages successful: ${successCount}/${maxPages}`);
  console.log(`Pages failed: ${failCount}`);
  console.log(`Total unique listings: ${results.length}`);
  console.log(`Output saved to: ${outputFile}`);
}

main().catch(console.error);
