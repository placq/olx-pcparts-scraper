import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync } from 'fs';

puppeteer.use(stealth());

const BASE_URL = 'https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci';
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
let delay = DEFAULT_DELAY;
let outputFile = DEFAULT_OUTPUT;
let targetCategory = null;
let minPrice = null;
let maxPrice = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--delay' && args[i + 1]) {
    delay = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  } else if (args[i] === '--category' && args[i + 1]) {
    targetCategory = args[i + 1];
    i++;
  } else if (args[i] === '--min-price' && args[i + 1]) {
    minPrice = parseFloat(args[i + 1]);
    i++;
  } else if (args[i] === '--max-price' && args[i + 1]) {
    maxPrice = parseFloat(args[i + 1]);
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

function buildUrl(categorySlug, pageNum) {
  let url = `${BASE_URL}/${categorySlug}/?courier=1`;
  
  if (minPrice !== null) {
    url += `&search[filter_float_price:from]=${minPrice}`;
  }
  if (maxPrice !== null) {
    url += `&search[filter_float_price:to]=${maxPrice}`;
  }
  
  if (pageNum > 1) {
    url += `&page=${pageNum}`;
  }
  
  return url;
}

function parsePrice(priceStr) {
  if (!priceStr || priceStr === 'N/A') return NaN;
  const cleaned = priceStr.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function filterByPrice(listings) {
  if (minPrice === null && maxPrice === null) return listings;
  return listings.filter(listing => {
    const price = parsePrice(listing.price);
    if (isNaN(price)) return true;
    if (minPrice !== null && price < minPrice) return false;
    if (maxPrice !== null && price > maxPrice) return false;
    return true;
  });
}

async function checkPageCount(browser, categorySlug) {
  const url = buildUrl(categorySlug, 1);
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('div[data-cy="ad-card-title"]', { timeout: 10000 });
    
    const paginationInfo = await page.evaluate(() => {
      const paginationLinks = document.querySelectorAll('a[href*="page="]');
      if (paginationLinks.length === 0) {
        const cards = document.querySelectorAll('div[data-cy="ad-card-title"]');
        return cards.length > 0 ? 1 : 0;
      }
      const pages = Array.from(paginationLinks)
        .map(a => {
          const match = a.getAttribute('href').match(/page=(\d+)/);
          return match ? parseInt(match[1]) : null;
        })
        .filter(n => !isNaN(n) && n !== null);
      return pages.length > 0 ? Math.max(...pages) : 1;
    });
    
    await page.close();
    return paginationInfo;
  } catch (err) {
    console.error(`[${categorySlug}] Error checking page count: ${err.message}`);
    return 0;
  }
}

async function scrapePage(browser, category, pageNum) {
  const url = buildUrl(category.slug, pageNum);

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

  const maxPages = await checkPageCount(browser, category.slug);
  console.log(`[${category.name}] Detected ${maxPages} pages`);

  if (maxPages === 0) {
    await browser.close();
    console.log(`[${category.name}] No listings found`);
    return [];
  }

  let allListings = [];
  let failedPages = 0;
  let emptyPages = 0;

  for (let p = 1; p <= maxPages; p++) {
    const listings = await scrapePage(browser, category, p);
    
    if (listings.length === 0) {
      emptyPages++;
      if (emptyPages >= 2) {
        console.log(`[${category.name}] Stopping at page ${p} - empty pages detected`);
        break;
      }
    } else {
      emptyPages = 0;
    }
    
    allListings = allListings.concat(listings);
    console.log(`[${category.name}] Page ${p}/${maxPages} - Found ${listings.length}. Total: ${allListings.length}`);

    if (p < maxPages) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await browser.close();
  console.log(`[${category.name}] Done - ${allListings.length} listings`);

  return allListings;
}

async function main() {
  let filterStr = '';
  if (minPrice !== null || maxPrice !== null) {
    filterStr = ` | Price: ${minPrice !== null ? minPrice : '0'} - ${maxPrice !== null ? maxPrice : '∞'} PLN`;
  }
  
  console.log('=== OLX PC Parts Scraper (URL Filtering) ===');
  console.log(`Categories: ${categoriesToScrape.map(c => c.name).join(', ')}${filterStr}`);
  console.log(`Delay between pages: ${delay}ms`);
  console.log(`Output: ${outputFile}\n`);

  const startTime = Date.now();

  const resultsByCategory = await Promise.all(
    categoriesToScrape.map(category => scrapeCategory(category))
  );

  let allListings = resultsByCategory.flat();

  const byUrl = new Map();
  allListings.forEach(listing => {
    if (!byUrl.has(listing.url)) {
      byUrl.set(listing.url, listing);
    }
  });

  allListings = Array.from(byUrl.values());

  const beforeFilter = allListings.length;
  allListings = filterByPrice(allListings);
  
  if (minPrice !== null || maxPrice !== null) {
    const removed = beforeFilter - allListings.length;
    console.log(`\n[Filter] Before: ${beforeFilter} | Removed: ${removed} | After: ${allListings.length}`);
  }

  writeFileSync(outputFile, JSON.stringify(allListings, null, 2), 'utf-8');

  const byCategory = {};
  allListings.forEach(listing => {
    byCategory[listing.category] = (byCategory[listing.category] || 0) + 1;
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Total unique listings: ${allListings.length}`);
  console.log('\nBy category:');
  Object.entries(byCategory).forEach(([cat, count]) => {
    const catName = CATEGORIES.find(c => c.slug === cat)?.name || cat;
    console.log(`  ${catName}: ${count}`);
  });
  console.log(`\nOutput saved to: ${outputFile}`);
}

main().catch(console.error);
