# Obsidian Export Scripts

Export Obsidian vault data to JSON for use in external websites.

## Setup

```bash
cd scripts
npm install
```

## Usage

```bash
# Export all data types
node export-all.mjs

# Export only books
node export-books.mjs

# Export only series
node export-series.mjs
```

## Output

JSON files are written to `scripts/output/`:

-   `books.json` - Books from `Clippings/Books/`
-   `series.json` - TV series with `Kategorie: [[Serien]]`

## Adding New Data Types

1. Create `export-[type].mjs` (copy from `export-books.mjs`)
2. Update `KEY_MAP` for your frontmatter fields
3. Update `hasKategorie()` filter
4. Import and call from `export-all.mjs`
