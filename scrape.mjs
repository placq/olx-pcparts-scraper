import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

puppeteer.use(stealth());

const BASE_URL = 'https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci';
const DEFAULT_DELAY = 1000;
const DEFAULT_OUTPUT_DIR = 'output';
const WEBHOOK_URL = 'https://n8n.wphl.eu/webhook-test/e8e167c1-6915-4138-9739-c902134ad457';
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
let outputDir = DEFAULT_OUTPUT_DIR;
let singleOutputFile = null;
let targetCategory = null;
let minPrice = null;
let maxPrice = null;
let sendWebhook = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--delay' && args[i + 1]) {
    delay = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    singleOutputFile = args[i + 1];
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
  } else if (args[i] === '--output-dir' && args[i + 1]) {
    outputDir = args[i + 1];
    i++;
  } else if (args[i] === '--webhook') {
    sendWebhook = true;
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
    return { category, listings: [], slug: category.slug };
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
  
  const byUrl = new Map();
  allListings.forEach(listing => {
    if (!byUrl.has(listing.url)) {
      byUrl.set(listing.url, listing);
    }
  });
  
  const filteredListings = filterByPrice(Array.from(byUrl.values()));
  
  console.log(`[${category.name}] Done - ${allListings.length} scraped, ${filteredListings.length} after filter`);

  return { category, listings: filteredListings, slug: category.slug };
}

function saveResults(results, isSingleFile) {
  if (isSingleFile) {
    const allListings = results.flatMap(r => r.listings);
    writeFileSync(singleOutputFile, JSON.stringify(allListings, null, 2), 'utf-8');
    return { type: 'single', path: singleOutputFile, count: allListings.length };
  } else {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    const byCategory = {};
    results.forEach(result => {
      const filename = `${outputDir}/${result.slug}.json`;
      writeFileSync(filename, JSON.stringify(result.listings, null, 2), 'utf-8');
      byCategory[result.slug] = {
        path: filename,
        count: result.listings.length
      };
    });
    
    return { type: 'split', dir: outputDir, categories: byCategory };
  }
}

function buildWebhookPayload(results) {
  const categories = {};
  let totalCount = 0;
  
  results.forEach(result => {
    categories[result.slug] = {
      name: result.category.name,
      count: result.listings.length,
      listings: result.listings
    };
    totalCount += result.listings.length;
  });
  
  return {
    timestamp: new Date().toISOString(),
    settings: {
      categories: categoriesToScrape.map(c => c.slug),
      minPrice: minPrice,
      maxPrice: maxPrice
    },
    totalCount: totalCount,
    categories: categories
  };
}

async function sendToWebhook(payload) {
  console.log(`\n[Webhook] Sending to ${WEBHOOK_URL}...`);
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log(`[Webhook] SUCCESS - Status: ${response.status}`);
        return true;
      } else {
        console.error(`[Webhook] FAILED - Status: ${response.status}`);
      }
    } catch (err) {
      console.error(`[Webhook] ERROR: ${err.message}`);
    }
    
    if (attempt < MAX_RETRIES) {
      console.log(`[Webhook] Retrying in 3s... (${attempt}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  console.error(`[Webhook] FAILED after ${MAX_RETRIES} attempts`);
  return false;
}

async function main() {
  let filterStr = '';
  if (minPrice !== null || maxPrice !== null) {
    filterStr = ` | Price: ${minPrice !== null ? minPrice : '0'} - ${maxPrice !== null ? maxPrice : '∞'} PLN`;
  }
  
  const outputMode = singleOutputFile ? 'single file' : 'split by category';
  
  console.log('=== OLX PC Parts Scraper ===');
  console.log(`Categories: ${categoriesToScrape.map(c => c.name).join(', ')}${filterStr}`);
  console.log(`Delay between pages: ${delay}ms`);
  console.log(`Output mode: ${outputMode}`);
  if (singleOutputFile) {
    console.log(`Output file: ${singleOutputFile}`);
  } else {
    console.log(`Output dir: ${outputDir}/`);
  }
  if (sendWebhook) {
    console.log(`Webhook: ENABLED`);
  }
  console.log('');

  const startTime = Date.now();

  const results = await Promise.all(
    categoriesToScrape.map(category => scrapeCategory(category))
  );

  const saveResult = saveResults(results, !!singleOutputFile);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCount = results.reduce((sum, r) => sum + r.listings.length, 0);

  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Total listings: ${totalCount}`);
  
  if (saveResult.type === 'single') {
    console.log(`\nSaved to: ${saveResult.path}`);
  } else {
    console.log(`\nSaved to: ${saveResult.dir}/`);
    console.log('By category:');
    Object.entries(saveResult.categories).forEach(([slug, info]) => {
      const catName = CATEGORIES.find(c => c.slug === slug)?.name || slug;
      console.log(`  ${catName}: ${info.count} (${info.path})`);
    });
  }
  
  if (sendWebhook) {
    const payload = buildWebhookPayload(results);
    await sendToWebhook(payload);
  }
}

main().catch(console.error);
