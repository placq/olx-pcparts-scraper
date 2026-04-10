import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync } from 'fs';

puppeteer.use(stealth());

const BASE_URL = 'https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci';
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_DELAY = 1000;
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

async function scrapePage(browser, category, pageNum) {
  const url = pageNum === 1
    ? `${BASE_URL}/${category.slug}/?courier=1`
    : `${BASE_URL}/${category.slug}/?courier=1&page=${pageNum}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

      await page.close();
      return pageListings;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  return [];
}

async function scrapeCategory(category) {
  console.log(`[${category.name}] Starting...`);

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

  let allListings = [];
  let failedPages = 0;

  for (let p = 1; p <= maxPages; p++) {
    const listings = await scrapePage(browser, category, p);
    allListings = allListings.concat(listings);

    const success = listings.length > 0;
    if (success) {
      console.log(`[${category.name}] Page ${p}/${maxPages} - Found ${listings.length}. Total: ${allListings.length}`);
    } else {
      failedPages++;
      console.warn(`[${category.name}] Page ${p}/${maxPages} - FAILED (${failedPages} failed so far)`);
    }

    if (p < maxPages) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await browser.close();
  console.log(`[${category.name}] Done - ${allListings.length} listings, ${failedPages} failed pages`);

  return allListings;
}

async function main() {
  console.log('=== OLX PC Parts Scraper (Parallel) ===');
  console.log(`Categories: ${categoriesToScrape.map(c => c.name).join(', ')}`);
  console.log(`Pages per category: ${maxPages}`);
  console.log(`Delay between pages: ${delay}ms`);
  console.log(`Output: ${outputFile}\n`);

  const startTime = Date.now();

  const resultsByCategory = await Promise.all(
    categoriesToScrape.map(category => scrapeCategory(category))
  );

  const allListings = resultsByCategory.flat();

  const byUrl = new Map();
  allListings.forEach(listing => {
    if (!byUrl.has(listing.url)) {
      byUrl.set(listing.url, listing);
    }
  });

  const results = Array.from(byUrl.values());
  writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');

  const byCategory = {};
  results.forEach(listing => {
    byCategory[listing.category] = (byCategory[listing.category] || 0) + 1;
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Total unique listings: ${results.length}`);
  console.log('\nBy category:');
  Object.entries(byCategory).forEach(([cat, count]) => {
    const catName = CATEGORIES.find(c => c.slug === cat)?.name || cat;
    console.log(`  ${catName}: ${count}`);
  });
  console.log(`\nOutput saved to: ${outputFile}`);
}

main().catch(console.error);
