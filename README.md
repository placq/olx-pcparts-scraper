# OLX PC Parts Scraper

A fast CLI tool to scrape PC parts listings from multiple OLX.pl categories in parallel.

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
# Scrape all categories (6 categories × 25 pages = 150 pages)
node scrape.mjs

# Scrape specific category only
node scrape.mjs --category procesory

# Custom page count
node scrape.mjs --pages 10

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
| `--delay` | 1000 | Delay between pages (ms) |
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

## Performance

- **Parallel execution**: All categories scrape simultaneously
- **Estimated time**: ~5 minutes for full scrape (6 categories × 25 pages)
- **Memory**: ~1GB RAM recommended

## License

MIT
