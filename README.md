# OLX PC Parts Scraper

A CLI tool to scrape PC parts listings from multiple OLX.pl categories.

## Categories

- Dyski (Disks/Drives)
- Obudowy (Cases)
- Pamięci RAM (RAM Memory)
- Płyty główne (Motherboards)
- Procesory (Processors)
- Zasilacze (Power Supplies)

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
# Scrape all categories (default - 6 categories × 25 pages = 150 pages)
node scrape.mjs

# Scrape specific category only
node scrape.mjs --category procesory
node scrape.mjs --category dyski

# Custom page count per category
node scrape.mjs --pages 5

# Custom delay between pages (ms)
node scrape.mjs --delay 2000

# Custom output file
node scrape.mjs --output my-listings.json

# Combined options
node scrape.mjs --category zasilacze --pages 10 --delay 1000
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--category` | all | Category slug (dyski, obudowy, pamieci-ram, plyty-glowne, procesory, zasilacze) |
| `--pages` | 25 | Pages per category |
| `--delay` | 1500 | Delay between pages (ms) |
| `--output` | listings.json | Output file path |

## Output

Generates a JSON file with all listings:

```json
[
  {
    "title": "RTX 4070 Graphics Card",
    "url": "https://www.olx.pl/d/oferta/...",
    "price": "2 000 zł",
    "category": "procesory"
  }
]
```

## License

MIT
