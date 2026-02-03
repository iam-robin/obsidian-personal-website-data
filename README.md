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

-   `books.json` - Books from `Kategorie: [[Bücher]]`
-   `series.json` - TV series with `Kategorie: [[Serien]]`

## Book Covers Workflow

Book covers are stored locally in the Obsidian vault and copied to this repo during export.

### Adding a New Book with Cover

1. **In Obsidian vault**, create a new book note using the book template
2. Add a cover URL to the `Cover` field in frontmatter
3. Run the download script:
   ```bash
   cd /Users/robin/Documents/code/private/iamrobin/obsidian-personal-website-data
   node scripts/books/download-book-covers.mjs
   ```
4. The script will:
   - Download the cover image
   - Optimize/resize if needed (max 600x900px @ 85% quality)
   - Save to vault: `Attachments/Book Cover/{title-author}.jpg`
   - Update frontmatter: set `Cover (lokal)`, clear `Cover` field
5. Run the export to copy covers to this repo:
   ```bash
   node export-books.mjs
   ```
6. Commit and push:
   ```bash
   git add output/ scripts/
   git commit -m "Add new book: [Title]"
   git push origin main
   ```

### Updating an Existing Book Cover

1. Add a new URL to the `Cover` field in the book note's frontmatter
2. Run the download script (it will overwrite the existing cover)
3. Run the export script
4. Commit and push changes

### Book Cover Files

- **Source**: Obsidian vault at `/Users/robin/Documents/Obsidian/Notes/Attachments/Book Cover/`
- **Export destination**: `output/book-covers/` (83 covers)
- **Naming**: Lowercase with hyphens, e.g., `the-pillars-of-the-earth-ken-follett.jpg`
- **books.json**: Contains relative paths: `"cover": "book-covers/filename.jpg"`

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
3. Update `hasKategorie()` filter
4. Import and call from `export-all.mjs`
