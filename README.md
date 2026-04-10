# OLX PC Parts Scraper

A simple CLI tool to scrape PC parts listings from OLX.pl (Polish classifieds).

## Features

- Scrapes all listings from OLX's computer parts category
- Extracts: title, URL, price
- Deduplicates results by URL
- Headless browser with stealth mode to avoid blocking
- Configurable page count and delay

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
git clone git@github.com:placq/olx-pcparts-scraper.git
cd olx-pcparts-scraper
npm install
```

## Usage

```bash
# Scrape all 25 pages (default)
node scrape.mjs

# Custom page count
node scrape.mjs --pages 5

# Custom delay between pages (ms)
node scrape.mjs --delay 2000

# Combined options
node scrape.mjs --pages 10 --delay 1000 --output my-listings.json
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--pages` | 25 | Number of pages to scrape |
| `--delay` | 1500 | Delay between pages (ms) |
| `--output` | listings.json | Output file path |

## Output

Generates a JSON file with array of listings:

```json
[
  {
    "title": "RTX 4070 Graphics Card",
    "url": "https://www.olx.pl/d/oferta/...",
    "price": "2 000 zł"
  }
]
```

## License

MIT
