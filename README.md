# Obsidian Export Scripts

Export Obsidian vault data to JSON for use in external websites.

## Setup

```bash
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

JSON files are written to `output/`:

-   `books.json` - Books from the vault folder `books/`
-   `series.json` - TV series from the vault folder `series/`
-   `digital-garden.json` - Garden notes from the vault folder `garden/`

## Book Covers

Covers live in the Obsidian vault under `attachments/book-cover/`; each book note points to its file in the `cover` field. `export-books.mjs` takes care of the rest:

- **URL in `cover`** (e.g. pasted by hand): downloaded into the vault, resized, and the note's `cover` is rewritten to the local path.
- **Tiny cover** (under 200px wide, typically the Google thumbnail the Book Search plugin saves): replaced in place by a larger Open Library cover when one exists.
- **Copy to the website**: the cover is copied to `output/book-covers/` (slugified file name) whenever its content changed. `books.json` holds `"cover": "book-covers/<file>.jpg"`.
- **Spine colour**: if the note has no `spine_color`, the cover's dominant colour is used. The website picks a readable text colour itself.

To change a cover, either overwrite the image file in the vault (same name) or paste a new image URL into `cover`, then run the export.

## Website Integration

This repository is integrated into the personal website as a git submodule.

### Updating the Website with New Data

After adding/updating books in this repo:

```bash
cd /path/to/iamrobin-personal-website

# Update submodule to latest commit
git submodule update --remote data

# Commit the submodule update
git add data
git commit -m "Update book data"
git push origin main
```

The website's build process automatically:
1. Copies `output/book-covers/*` to `public/book-covers/`
2. Copies `output/books.json` to `src/data/books.json`
3. Serves covers from local domain at build time

### Submodule Configuration

- **Submodule path**: `data/` in website repo
- **URL**: `https://github.com/iam-robin/obsidian-personal-website-data.git` (HTTPS required for Vercel)
- **Build script**: `sync-book-cover-data` (runs before each build)

## Adding New Data Types

1. Create `export-[type].mjs` (copy from `export-books.mjs`)
2. Update `KEY_MAP` for your frontmatter fields
3. Update `hasCategory()` filter
4. Import and call from `export-all.mjs`
