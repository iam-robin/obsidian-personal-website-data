# Bookmark Cover Management Scripts

This directory contains Node.js scripts for managing bookmark cover thumbnails in the Obsidian vault. Bookmarks are imported from Raindrop with remote cover URLs that rot quickly (CDNs rotate, sites redesign, domains expire), so we archive each cover locally — same approach used for [book covers](../books/README.md).

## Overview

The bookmark cover workflow uses two frontmatter fields:

```yaml
Cover: 'https://example.com/thumb.jpg'    # Remote URL (kept as breadcrumb)
Cover (lokal): 'Attachments/Bookmark Cover/some-bookmark.jpg'
```

> **Difference from books:** the book cover script *clears* the `Cover` field after download. The bookmark script intentionally **keeps** the remote URL as a breadcrumb so it's possible to re-fetch later, or to compare against the original source if needed.

**Naming Convention:** All cover images use lowercase filenames in the format:

```
{title-slug}.jpg
```

Example: `de-atomization-is-the-secret-to-happiness.jpg`

Unlike books, bookmark filenames do **not** include an author — bookmark titles alone are unique enough in practice.

**Storage Location:** `/Users/robin/Documents/Obsidian/Notes/Attachments/Bookmark Cover/`

---

## Scripts

### download-bookmark-covers.mjs

**Purpose:** Downloads bookmark cover thumbnails from external URLs and saves them locally as resized JPEGs.

**Features:**

- Reads all bookmark notes from the Obsidian vault (filtered by `Kategorie: Bookmarks`)
- Downloads covers from URLs in the `Cover` field
- Always optimizes via `sharp` — resizes to max 800px wide, JPEG quality 80, no enlargement
- Saves with standardized lowercase filenames
- Updates bookmark frontmatter automatically via `gray-matter`
- Keeps the original `Cover` URL as a breadcrumb (not cleared)
- **Idempotent:** skips bookmarks that already have a `Cover (lokal)` field with an existing local file, even if the remote `Cover` URL is still set
- **Self-cleaning on broken URLs:** definitively dead covers (HTTP 4xx, non-image content, oversize) get both `Cover` and `Cover (lokal)` cleared in the note, so future runs skip them instead of re-hitting the dead URL
- **Transient errors are preserved:** HTTP 5xx and network errors leave the note untouched, so the next run can retry

**Usage:**

```bash
# Dry run — see what would be downloaded without making changes
node scripts/bookmarks/download-bookmark-covers.mjs --dry-run

# Test mode — download only first 2 bookmarks
node scripts/bookmarks/download-bookmark-covers.mjs --test

# Full download — process all bookmarks
node scripts/bookmarks/download-bookmark-covers.mjs
```

**Workflow:**

1. Import bookmarks from Raindrop (via the vault's `scripts/import-bookmarks.mjs`)
2. Run this script to fetch and archive all covers
3. Bookmarks now have a `Cover (lokal)` path; the vault is portable and resistant to link rot
4. Re-run any time after adding new bookmarks — already-archived ones are skipped automatically

**Broken URLs:**

Failures are split into two categories:

- **Definitive failures** — HTTP 4xx (404, 410, etc.), non-image `Content-Type`, or images larger than 10MB. These are treated as permanently broken: the script clears both `Cover` and `Cover (lokal)` in the note's frontmatter and logs the bookmark with `(cleared)`. On subsequent runs, the bookmark has no URL to fetch so it's silently skipped. To fix it later, paste a new working URL into `Cover` and re-run.
- **Transient failures** — HTTP 5xx, network errors, DNS timeouts. The note is **not** modified, and the bookmark is logged with `(will retry)`. Re-running the script will try again.

**Example Output:**

```
🔖 Bookmark Cover Download Script - FULL DOWNLOAD MODE
============================================================

🔍 Searching for bookmark notes...
✅ Found 67 bookmark notes

📊 Analysis Results:
------------------------------------------------------------
Total bookmarks:              67
Bookmarks with Cover URL:     67
Bookmarks with local cover:   0
Already have local file:      0
Missing Cover URL:            0
Need to download:             67

📥 Downloading 67 bookmark covers...
------------------------------------------------------------
[1/67] De-Atomization is the Secret to Happiness... ✅ 0.08MB (optimized from 0.32MB, saved 240KB) + frontmatter updated
[2/67] Fields of Chess... ✅ 0.05MB (optimized from 0.11MB, saved 60KB) + frontmatter updated
[3/67] Some Dead Bookmark... ❌ HTTP 404: Not Found — cleared frontmatter
[4/67] Server Hiccup... ⏳ HTTP 502: Bad Gateway — transient, will retry next run
...

⚠️  Failed downloads:
------------------------------------------------------------
  • Some Dead Bookmark (cleared)
      url:   https://dead-cdn.example.com/thumb.png
      error: HTTP 404: Not Found
  • Server Hiccup (will retry)
      url:   https://flaky.example.com/thumb.jpg
      error: HTTP 502: Bad Gateway

📋 Download Summary:
  ✅ Successfully downloaded: 64
  🗑️  Broken (cleared):        2
  ⏳ Transient (will retry):  1
  📁 Saved to: /Users/robin/Documents/Obsidian/Notes/Attachments/Bookmark Cover
```

---

## Common Workflows

### Importing and archiving a fresh batch from Raindrop

```bash
# 1. In the vault repo: import bookmarks from the exported CSV
cd ~/Documents/Obsidian/Notes
node scripts/import-bookmarks.mjs --write

# 2. In this repo: archive their cover thumbnails locally
cd ~/Documents/code/private/iamrobin/obsidian-personal-website-data
node scripts/bookmarks/download-bookmark-covers.mjs --dry-run   # preview
node scripts/bookmarks/download-bookmark-covers.mjs             # actually download
```

### Re-running after adding a few new bookmarks

Just run the script again. Already-archived bookmarks are skipped automatically — only the new ones get fetched.

### Fixing a broken cover

1. Find a working URL for the bookmark
2. Replace the `Cover` value in the bookmark's frontmatter
3. Delete the (probably non-existent) `Cover (lokal)` line, or leave it unset
4. Re-run `download-bookmark-covers.mjs`

---

## Dependencies

All scripts use:

- **gray-matter** — YAML frontmatter parsing (already in `package.json`)
- **sharp** — Image optimization (already in `package.json`)
- **glob** — File pattern matching (via `lib/utils.mjs`)
- **Node.js 18+** — For native `fetch` API

Install dependencies in the project root:

```bash
npm install
```

---

## File Locations

- **Scripts:** `/obsidian-personal-website-data/scripts/bookmarks/`
- **Utilities:** `/obsidian-personal-website-data/lib/utils.mjs`
- **Obsidian Vault:** `/Users/robin/Documents/Obsidian/Notes/`
- **Cover Storage:** `/Users/robin/Documents/Obsidian/Notes/Attachments/Bookmark Cover/`
- **Bookmark Notes:** `/Users/robin/Documents/Obsidian/Notes/Library/Bookmarks/*.md`

---

## Technical Details

### Image Optimization

Every downloaded cover is run through `sharp`:

- Maximum width: 800px (height auto, aspect ratio preserved)
- Format: JPEG
- Quality: 80%
- Fit mode: Inside, no enlargement (small images stay small)

Bookmark thumbnails are decorative, so the quality budget is intentionally smaller than for book covers (which use 600×900 @ q85).

### Filename Sanitization

The `sanitizeFilename()` function:

1. Converts the title to lowercase
2. Replaces non-alphanumeric characters with hyphens
3. Collapses multiple hyphens to a single one
4. Removes leading/trailing hyphens
5. Limits to 100 characters
6. Appends `.jpg`

Example: `"De-Atomization is the Secret to Happiness"` → `de-atomization-is-the-secret-to-happiness.jpg`

### Bookmark Filtering

Bookmarks are identified via `hasKategorie(data, "Bookmarks")` from `lib/utils.mjs`, which matches notes whose `Kategorie` frontmatter (after wikilink cleaning) includes the string `"Bookmarks"`. This matches the convention used by `import-bookmarks.mjs` in the vault repo, which tags every imported note with `Kategorie: [[Bookmarks]]`.

---

## Troubleshooting

### Failed downloads

- URL is invalid, returns 404, or has been redirected to a non-image (e.g. login wall)
- Server blocks the User-Agent — the script identifies as Safari on macOS, but some CDNs are stricter
- Image format isn't recognized by `sharp`
- Manually find a replacement URL and re-run

### Frontmatter not updating

- Check that the YAML in the bookmark note is valid
- Make sure `gray-matter` can parse the frontmatter (try opening the note in Obsidian — broken YAML is usually flagged)
- Verify the note actually has `Kategorie: [[Bookmarks]]`, otherwise it's filtered out

### Wrong-looking thumbnails

Some Raindrop covers point to dynamic preview services (e.g. `rdl.ink/render/...`, `preview.mmm.page/...`) that generate a screenshot of the page on demand. These usually work but the result is a generic page screenshot, not a hand-picked thumbnail. To replace one, find a better URL manually and re-run.

---

## Future Enhancements

- **`export-bookmarks.mjs`** at the repo root, alongside `export-books.mjs` and `export-series.mjs`, to ship bookmarks (with their local covers) to the personal website as JSON
- **`cleanup-bookmark-covers.mjs`** if frontmatter inconsistencies start to accumulate (mirroring the books cleanup script)
- **`rename-bookmark-covers.mjs`** if filenames drift from the lowercase convention (mirroring the books rename script)
- Retry logic for transient network failures
- Optional fallback to a screenshot service when the original cover URL is dead
