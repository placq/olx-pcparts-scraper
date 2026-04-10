import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync } from 'fs';

puppeteer.use(stealth());

const BASE_URL = 'https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci';
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_DELAY = 1500;
const DEFAULT_OUTPUT = 'listings.json';
const MAX_RETRIES = 3;

const CATEGORIES = [
  { slug: 'dyski', name: 'Dyski' },
  { slug: 'obudowy', name: 'Obudowy' },
  { slug: 'pamieci-ram', name: 'Pamięci RAM' },
  { slug: 'plyty-glowne', name: 'Płyty główne' },
  { slug: 'procesory', name: 'Procesory' },
  { slug: 'zasilacze', name: 'Zasilacze' }
];

const args = process.argv.slice(2);
let maxPages = DEFAULT_MAX_PAGES;
let delay = DEFAULT_DELAY;
let outputFile = DEFAULT_OUTPUT;
let targetCategory = null;

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
  } else if (args[i] === '--category' && args[i + 1]) {
    targetCategory = args[i + 1];
    i++;
  }
}

const categoriesToScrape = targetCategory
  ? CATEGORIES.filter(c => c.slug === targetCategory || c.name.toLowerCase() === targetCategory.toLowerCase())
  : CATEGORIES;

if (targetCategory && categoriesToScrape.length === 0) {
  console.error(`Category "${targetCategory}" not found. Available: ${CATEGORIES.map(c => c.slug).join(', ')}`);
  process.exit(1);
}

const listings = new Map();

async function scrapePage(page, category, pageNum) {
  const url = pageNum === 1
    ? `${BASE_URL}/${category.slug}/?courier=1`
    : `${BASE_URL}/${category.slug}/?courier=1&page=${pageNum}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('div[data-cy="ad-card-title"]', { timeout: 10000 });

      const pageListings = await page.evaluate((catSlug) => {
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
            const url = href.startsWith('http') ? href : `https://www.olx.pl${href}`;
            results.push({ title, url, price, category: catSlug });
          }
        });

        return results;
      }, category.slug);

      let newCount = 0;
      pageListings.forEach(listing => {
        if (!listings.has(listing.url)) {
          listings.set(listing.url, listing);
          newCount++;
        }
      });

      console.log(`[${category.name}] Page ${pageNum}/${maxPages} - Found ${pageListings.length}, ${newCount} new. Total: ${listings.size}`);

      if (pageListings.length === 0) {
        console.warn(`[${category.name}] Page ${pageNum} - WARNING: No listings found.`);
      }

      return true;
    } catch (err) {
      console.error(`[${category.name}] Page ${pageNum} - Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.error(`[${category.name}] Page ${pageNum} - FAILED after ${MAX_RETRIES} attempts`);
  return false;
}

async function scrapeCategory(page, category) {
  console.log(`\n=== Scraping category: ${category.name} ===`);

  let successCount = 0;
  let failCount = 0;

  for (let p = 1; p <= maxPages; p++) {
    const success = await scrapePage(page, category, p);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    if (p < maxPages) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`[${category.name}] Done - Success: ${successCount}/${maxPages}, Failed: ${failCount}`);
  return { successCount, failCount };
}

async function main() {
  console.log('=== OLX PC Parts Multi-Category Scraper ===');
  console.log(`Categories: ${categoriesToScrape.map(c => c.name).join(', ')}`);
  console.log(`Pages per category: ${maxPages}`);
  console.log(`Delay between pages: ${delay}ms`);
  console.log(`Output: ${outputFile}\n`);

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

  let totalSuccess = 0;
  let totalFail = 0;

  for (const category of categoriesToScrape) {
    const result = await scrapeCategory(page, category);
    totalSuccess += result.successCount;
    totalFail += result.failCount;

    const isLast = category === categoriesToScrape[categoriesToScrape.length - 1];
    if (!isLast) {
      console.log(`Waiting ${delay * 2}ms before next category...`);
      await new Promise(r => setTimeout(r, delay * 2));
    }
  }

  await browser.close();

  const results = Array.from(listings.values());
  writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');

  const byCategory = {};
  results.forEach(listing => {
    byCategory[listing.category] = (byCategory[listing.category] || 0) + 1;
  });

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Total pages: ${totalSuccess + totalFail}/${maxPages * categoriesToScrape.length}`);
  console.log(`Pages successful: ${totalSuccess}`);
  console.log(`Pages failed: ${totalFail}`);
  console.log(`Total unique listings: ${results.length}`);
  console.log('\nBy category:');
  Object.entries(byCategory).forEach(([cat, count]) => {
    const catName = CATEGORIES.find(c => c.slug === cat)?.name || cat;
    console.log(`  ${catName}: ${count}`);
  });
  console.log(`\nOutput saved to: ${outputFile}`);
}

main().catch(console.error);
