# OLX PC Parts Scraper - Projekt

## Cel projektu
CLI aplikacja do scrapowania ofert części komputerowych z OLX.pl.

## Struktura projektu
```
olx-pcparts-scraper/
├── scrape.mjs          # Główny scraper
├── package.json        # Konfiguracja npm
├── README.md          # Dokumentacja
├── .gitignore
└── output/            # Folder z wynikami (generowany)
    ├── dyski.json
    ├── obudowy.json
    ├── pamieci-ram.json
    ├── plyty-glowne.json
    ├── procesory.json
    └── zasilacze.json
```

## Funkcjonalności

### 1. Scrapowanie kategorii
- **6 kategorii**: dyski, obudowy, pamieci-ram, plyty-glowne, procesory, zasilacze
- **Parallel execution** - każda kategoria w osobnej przeglądarce
- **Dynamic pagination** - automatycznie wykrywa koniec wyników
- **Deduplikacja** - po URL

### 2. Filtrowanie cenowe
- **URL filtering** - parametry w URL OLX przyspieszają scrape
- **Client-side filtering** - backup dla 100% dokładności
- Parametry: `--min-price` i `--max-price`

### 3. Tryby wyjścia
- **Split mode (domyślny)** - osobne pliki JSON per kategoria w `output/`
- **Single file mode** - `--output <file>` - wszystko w jednym pliku

### 4. Webhook (n8n)
- **URL**: `https://n8n.wphl.eu/webhook-test/e8e167c1-6915-4138-9739-c902134ad457`
- **Flagi**: `--webhook` - wysyła cały payload po zakończeniu
- **Payload format**:
```json
{
  "timestamp": "2025-04-10T12:00:00.000Z",
  "settings": {
    "categories": ["dyski", "obudowy", ...],
    "minPrice": 100,
    "maxPrice": 1000
  },
  "totalCount": 3500,
  "categories": {
    "dyski": {
      "name": "Dyski",
      "count": 600,
      "listings": [...]
    }
  }
}
```

## Użycie

```bash
# Podstawowe użycie - wszystkie kategorie, split output
node scrape.mjs

# Konkretna kategoria
node scrape.mjs --category procesory

# Filtrowanie cenowe
node scrape.mjs --min-price 100 --max-price 1000

# Tryb single file
node scrape.mjs --output all.json

# Webhook (n8n)
node scrape.mjs --webhook

# Własny folder wyjściowy
node scrape.mjs --output-dir moje-dane/

# Kombinacja
node scrape.mjs --webhook --min-price 100 --max-price 1000
```

## Opcje CLI

| Opcja | Domyślnie | Opis |
|-------|----------|------|
| `--category` | all | Kategoria (dyski, obudowy, pamieci-ram, plyty-glowne, procesory, zasilacze) |
| `--delay` | 1000 | Opóźnienie między stronami (ms) |
| `--output` | - | Tryb single file |
| `--output-dir` | output/ | Folder dla trybu split |
| `--min-price` | - | Min cena (PLN) |
| `--max-price` | - | Max cena (PLN) |
| `--webhook` | false | Wysyłanie do n8n |

## Technologie
- **Puppeteer Extra** - headless browser
- **Stealth Plugin** - unikanie wykrycia
- **Node.js fetch** - webhook HTTP POST
- **Parallel scraping** - Promise.all() dla kategorii

## TODO / Następne kroki

### Zrobione ✅
- [x] Podstawowy scraper z Puppeteer
- [x] Multi-category support
- [x] Parallel execution
- [x] URL-based price filtering
- [x] Dynamic pagination
- [x] Split output by category
- [x] Webhook integration (n8n)

### Do zrobienia 🔲
- [ ] Test webhooka z n8n
- [ ] Cron job na serwerze LXC
- [ ] Rozważyć dodanie więcej kategorii OLX
- [ ] Historia zmian cen (porównanie z poprzednim scrapem)
- [ ] Export do innych formatów (CSV, Excel)

## Cron na LXC
```bash
# Crontab - codziennie o 6:00
0 6 * * * cd /path/to/olx-pcparts-scraper && node scrape.mjs --webhook --min-price 100 --max-price 1000 >> /var/log/olx-scraper.log 2>&1
```

## Repozytorium
https://github.com/placq/olx-pcparts-scraper

## Instalacja na nowym serwerze
```bash
git clone git@github.com:placq/olx-pcparts-scraper.git
cd olx-pcparts-scraper
npm install
```
