# Book Cover Management Scripts

This directory contains Node.js scripts for managing book cover images in the Obsidian vault. These scripts handle downloading, cleaning up, and maintaining book cover images with a standardized naming convention.

## Overview

The book cover workflow uses two frontmatter fields:

```yaml
Cover: ""           # Temporary: URL for downloading (cleared after download)
Cover (lokal): ""   # Permanent: Local file path to cover image
```

**Naming Convention:** All cover images use lowercase filenames with the format:
```
{title}-{author}.jpg
```
Example: `the-pillars-of-the-earth-ken-follett.jpg`

**Storage Location:** `/Users/robin/Documents/Obsidian/Notes/Attachments/Book Cover/`

---

## Scripts

### 1. download-book-covers.mjs

**Purpose:** Downloads book cover images from external URLs and saves them locally.

**Features:**
- Reads all book notes from Obsidian vault
- Downloads covers from URLs in `Cover` field
- Auto-optimizes images larger than 100KB (resizes to max 600×900px @ 85% quality)
- Saves with standardized lowercase filenames
- Updates book frontmatter automatically
- Clears `Cover` field value after download (keeps key for future updates)
- Overwrites existing covers when new URL is provided (allows updating covers)
- Skips books that have local covers but no new URL

**Usage:**

```bash
# Dry run - see what would be downloaded without making changes
node scripts/books/download-book-covers.mjs --dry-run

# Test mode - download only first 2 books
node scripts/books/download-book-covers.mjs --test

# Full download - process all books
node scripts/books/download-book-covers.mjs
```

**Workflow:**
1. Add cover URL to `Cover` field in book note
2. Run script
3. Script downloads image, optimizes if needed, and saves to vault
4. Script updates `Cover (lokal)` with path and clears `Cover` value

**Note:** If a book already has a local cover (`Cover (lokal)` set) but you add a new URL to the `Cover` field, the script will download the new image and overwrite the existing one. This allows you to easily update covers by simply adding a new URL.

**Error Handling:**
- Failed downloads are logged but don't stop the process
- Summary report shows success/failure counts
- Skips books without `Cover` URLs

**Example Output:**
```
📥 Downloading 5 book covers...
[1/5] The Great Gatsby... ✅ 0.15MB + frontmatter updated
[2/5] 1984... ✅ 0.22MB (optimized from 0.85MB, saved 630KB) + frontmatter updated
[3/5] Dune... ❌ HTTP 404: Not Found
```

---

### 2. cleanup-book-covers.mjs

**Purpose:** Cleans up book frontmatter to ensure consistent structure across all book notes.

**Features:**
- Processes all books in vault
- Verifies local cover files exist
- Sets `Cover (lokal)` to path or empty string
- Ensures `Cover` field is present (empty value)
- Removes stale external URLs
- Maintains YAML structure

**Usage:**

```bash
node scripts/books/cleanup-book-covers.mjs
```

**When to Use:**
- After bulk operations or migrations
- When frontmatter structure becomes inconsistent
- To ensure all books have both required fields
- To remove external URLs from books with local covers

**What It Does:**
- **Books with local covers:** Verifies file exists, sets path, clears `Cover`
- **Books without covers:** Sets both fields to empty strings
- **Already correct books:** Skips (no changes made)

**Example Output:**
```
🧹 Book Cover Frontmatter Cleanup Script
[1/84] The Great Gatsby... ✅ Has local cover
[2/84] 1984... ⚪ No local cover
[3/84] Dune... ✅ Has local cover

📋 Cleanup Summary:
  Total books processed:     84
  Books with local covers:   19
  Books without covers:      65
  Frontmatter updated:       83
```

---

### 3. rename-book-covers.mjs

**Purpose:** Renames book cover files to follow the standardized lowercase naming convention.

**Features:**
- Scans all books with local covers
- Generates expected filename based on title and author
- Renames files that don't match convention
- Updates frontmatter paths automatically
- Handles case-insensitive filesystems (macOS) via two-step rename
- Skips files already following convention

**Usage:**

```bash
node scripts/books/rename-book-covers.mjs
```

**When to Use:**
- After manually adding cover images
- When filenames don't follow lowercase convention
- To standardize existing covers

**Naming Rules:**
- Convert title and author to lowercase
- Replace special characters with hyphens
- Remove multiple consecutive hyphens
- Limit length to 100 characters
- Format: `{title}-{author}.jpg`

**Example Transformations:**
```
Before: The-Pillars-of-the-Earth-Ken-Follett.jpg
After:  the-pillars-of-the-earth-ken-follett.jpg

Before: Hey guten Morgen wie geht es dir - Martina Hefter.jpg
After:  hey-guten-morgen-wie-geht-es-dir-martina-hefter.jpg

Before: small-things-like-these.jpg
After:  small-things-like-these-claire-keegan.jpg
```

**Example Output:**
```
🔄 Book Cover Rename Script
[1/19] The Pillars of the Earth... ✅ Renamed
    From: The-Pillars-of-the-Earth-Ken-Follett.jpg
    To:   the-pillars-of-the-earth-ken-follett.jpg
[2/19] Station Eleven... ✓ Already correct

📋 Rename Summary:
  Total books with covers:   19
  Renamed:                   15
  Already correct:           4
```

---

## Common Workflows

### Adding a New Book with Cover

1. Create book note using template
2. Add cover URL to `Cover` field:
   ```yaml
   Cover: 'https://example.com/cover.jpg'
   Cover (lokal): ''
   ```
3. Run download script:
   ```bash
   node scripts/books/download-book-covers.mjs
   ```
4. Result:
   ```yaml
   Cover: ''
   Cover (lokal): 'Attachments/Book Cover/book-title-author.jpg'
   ```

### Updating an Existing Cover

1. Add new URL to `Cover` field in book note
2. Run download script (will overwrite existing file)
3. `Cover` field is cleared again, `Cover (lokal)` updated

### Fixing Non-Standard Filenames

```bash
# Rename all covers to lowercase convention
node scripts/books/rename-book-covers.mjs

# Verify structure is correct
node scripts/books/cleanup-book-covers.mjs
```

### Bulk Maintenance

```bash
# 1. Clean up all frontmatter
node scripts/books/cleanup-book-covers.mjs

# 2. Standardize all filenames
node scripts/books/rename-book-covers.mjs

# 3. Download any new covers
node scripts/books/download-book-covers.mjs
```

---

## Dependencies

All scripts use:
- **gray-matter** - YAML frontmatter parsing (already in package.json)
- **sharp** - Image optimization (already in package.json)
- **glob** - File pattern matching (via lib/utils.mjs)
- **Node.js 18+** - For native fetch API

Install dependencies in the project root:
```bash
npm install
```

---

## File Locations

- **Scripts:** `/obsidian-personal-website-data/scripts/books/`
- **Utilities:** `/obsidian-personal-website-data/lib/utils.mjs`
- **Obsidian Vault:** `/Users/robin/Documents/Obsidian/Notes/`
- **Cover Storage:** `/Users/robin/Documents/Obsidian/Notes/Attachments/Book Cover/`
- **Book Notes:** `/Users/robin/Documents/Obsidian/Notes/Clippings/Books/*.md`

---

## Technical Details

### Image Optimization

Images larger than 100KB are automatically optimized:
- Maximum dimensions: 600×900px (maintains aspect ratio)
- Format: JPEG
- Quality: 85%
- Fit mode: Inside (no enlargement)

### Filename Sanitization

The `sanitizeFilename()` function:
1. Extracts first author from array
2. Combines title and author with hyphen
3. Converts to lowercase
4. Replaces non-alphanumeric characters with hyphens
5. Collapses multiple hyphens to single
6. Removes leading/trailing hyphens
7. Limits to 100 characters

### Case-Insensitive Filesystem Handling

macOS uses case-insensitive filesystems by default. The rename script handles this by:
1. Detecting case-only changes
2. Using two-step rename via temporary file
3. Preventing "target exists" errors

---

## Troubleshooting

### "File not found" errors
- Verify book note has correct `Cover (lokal)` path
- Check file exists in `Attachments/Book Cover/` directory
- Run cleanup script to fix paths

### "Target exists" errors
- Another file with same name already exists
- Manually resolve conflict or rename one of the books

### Failed downloads
- URL is invalid or returns 404
- Network issues or rate limiting
- Image format not supported
- Manually download and add to vault

### Frontmatter not updating
- Check YAML syntax is valid
- Ensure gray-matter can parse frontmatter
- Try running cleanup script

---

## Future Enhancements

Potential improvements:
- Add `--book "Title"` flag to process single book
- Support batch URL updates from CSV
- Add progress bar for large downloads
- Generate missing covers from book title/author
- Verify image integrity after download
- Add retry logic for failed downloads
