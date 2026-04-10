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
# Scrape all categories (default: split output to output/)
node scrape.mjs

# Single file output
node scrape.mjs --output all-listings.json

# Scrape specific category only
node scrape.mjs --category procesory

# Custom output directory
node scrape.mjs --output-dir my-data/

# Filter by price range (URL filtering + client-side validation)
node scrape.mjs --min-price 100 --max-price 1000

# Combined options
node scrape.mjs --category zasilacze --min-price 200 --output-dir zasilacze-data/
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--category` | all | Category slug (dyski, obudowy, pamieci-ram, plyty-glowne, procesory, zasilacze) |
| `--delay` | 1000 | Delay between pages (ms) |
| `--output` | none | Single file output (default: split by category) |
| `--output-dir` | output/ | Output directory for split mode |
| `--min-price` | none | Minimum price filter (PLN) |
| `--max-price` | none | Maximum price filter (PLN) |

## Output

### Split Mode (default)
Creates separate JSON files per category in `output/`:
```
output/
├── dyski.json
├── obudowy.json
├── pamieci-ram.json
├── plyty-glowne.json
├── procesory.json
└── zasilacze.json
```

### Single File Mode
Combines all results into one file:
```bash
node scrape.mjs --output all-listings.json
```

### JSON Format
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
- **Dynamic pagination**: Auto-detects end of results
- **URL + client filtering**: Fast and accurate price filtering
- **Estimated time**: ~5 minutes for full scrape (6 categories × 25 pages)

## License

MIT
