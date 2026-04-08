#!/usr/bin/env node

/**
 * Download remote bookmark cover thumbnails to a local Attachments folder.
 *
 * Bookmarks imported from Raindrop reference cover images by URL. Those URLs
 * rot quickly (CDNs rotate, sites redesign, domains expire), so we archive
 * each cover locally — same approach used for book covers.
 *
 * For each bookmark note in Library/Bookmarks/ that has a `Cover:` URL but
 * no `Cover (lokal):` field yet, this script:
 *   1. Fetches the cover URL.
 *   2. Resizes/recompresses it to max 800px wide JPEG via sharp.
 *   3. Saves it as Attachments/Bookmark Cover/<slug>.jpg.
 *   4. Adds a `Cover (lokal):` frontmatter field. The original `Cover:` URL
 *      is preserved as a breadcrumb (unlike books, which clear it).
 *
 * Idempotent: notes that already have a `Cover (lokal):` field with an
 * existing local file are skipped on subsequent runs.
 *
 * Broken URLs (HTTP 4xx, non-image content, oversize) are treated as
 * permanently dead: both `Cover` and `Cover (lokal)` are cleared in the
 * note's frontmatter so future runs skip them. Transient failures (HTTP
 * 5xx, network errors) leave the note untouched for retry on the next run.
 *
 * Usage:
 *   node scripts/bookmarks/download-bookmark-covers.mjs --dry-run
 *   node scripts/bookmarks/download-bookmark-covers.mjs --test     # first 2 only
 *   node scripts/bookmarks/download-bookmark-covers.mjs            # full run
 */

import { existsSync } from "fs";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join, relative } from "path";
import matter from "gray-matter";
import sharp from "sharp";
import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    VAULT_PATH,
} from "../../lib/utils.mjs";

const COVER_DIR = join(VAULT_PATH, "Attachments/Bookmark Cover");

// Parse command line arguments
const args = process.argv.slice(2);
const dryRunMode = args.includes("--dry-run");
const testMode = args.includes("--test");
const testCount = testMode ? 2 : 0;

/**
 * Sanitize bookmark title into a safe lowercase filename.
 * Mirrors the book script's pattern but uses title only (no author).
 */
function sanitizeFilename(title) {
    const filename = title
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);

    return `${filename}.jpg`;
}

/**
 * Update bookmark frontmatter: set `Cover (lokal)` to the relative path,
 * leave `Cover` (the remote URL) untouched as a breadcrumb.
 */
async function updateBookmarkFrontmatter(filepath, localCoverPath) {
    const content = await readFile(filepath, "utf-8");
    const { data, content: body } = matter(content);

    const relativePath = relative(VAULT_PATH, localCoverPath);
    data["Cover (lokal)"] = relativePath;

    const updated = matter.stringify(body, data);
    await writeFile(filepath, updated, "utf-8");
}

/**
 * Mark a bookmark's cover as definitively broken: clear both `Cover` (the
 * dead remote URL) and `Cover (lokal)` (no local file). This records the
 * broken state in the note so future runs of this script see "no URL" and
 * skip it instead of re-hitting the dead URL.
 */
async function clearBookmarkCover(filepath) {
    const content = await readFile(filepath, "utf-8");
    const { data, content: body } = matter(content);

    data.Cover = "";
    data["Cover (lokal)"] = "";

    const updated = matter.stringify(body, data);
    await writeFile(filepath, updated, "utf-8");
}

/**
 * Construct an Error tagged as "definitive" — meaning the cover URL is
 * permanently broken (404, non-image, too large) and re-trying won't help.
 * Used to distinguish from transient failures (network, 5xx) that should
 * be left alone for retry on the next run.
 */
function definitiveError(message) {
    const err = new Error(message);
    err.definitive = true;
    return err;
}

/**
 * Download a cover image and resize it to max 800px wide JPEG.
 */
async function downloadCover(url, destinationPath) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
    });

    if (!response.ok) {
        // 4xx → permanently broken (URL is dead). 5xx → transient (retry later).
        const msg = `HTTP ${response.status}: ${response.statusText}`;
        if (response.status >= 400 && response.status < 500) {
            throw definitiveError(msg);
        }
        throw new Error(msg);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
        throw definitiveError(`Not an image (Content-Type: ${contentType})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    const originalSizeKB = buffer.length / 1024;
    const originalSizeMB = buffer.length / (1024 * 1024);

    if (originalSizeMB > 10) {
        throw definitiveError(`Image too large (${originalSizeMB.toFixed(2)}MB)`);
    }

    await mkdir(COVER_DIR, { recursive: true });

    // Always normalize bookmark thumbs: max 800px wide, JPEG q80.
    // Bookmark covers are decorative thumbnails so quality budget is small.
    let optimized = false;
    let finalSizeKB = originalSizeKB;
    try {
        const optimizedBuffer = await sharp(buffer)
            .resize(800, null, {
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        buffer = optimizedBuffer;
        finalSizeKB = buffer.length / 1024;
        optimized = true;
    } catch (error) {
        console.warn(`    ⚠️  Optimization failed, using original: ${error.message}`);
    }

    await writeFile(destinationPath, buffer);

    return {
        sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
        originalSizeMB: originalSizeMB.toFixed(2),
        optimized,
        savedKB: optimized ? (originalSizeKB - finalSizeKB).toFixed(0) : 0,
    };
}

async function main() {
    const mode = dryRunMode ? "DRY RUN" : testMode ? "TEST" : "FULL DOWNLOAD";
    console.log(`🔖 Bookmark Cover Download Script - ${mode} MODE`);
    console.log("=".repeat(60));
    console.log();

    console.log("🔍 Searching for bookmark notes...");
    const files = await findMarkdownFiles("**/*.md");

    const bookmarks = [];
    for (const file of files) {
        const { data } = await parseMarkdownFile(file);
        if (hasKategorie(data, "Bookmarks")) {
            bookmarks.push({ data, file });
        }
    }

    console.log(`✅ Found ${bookmarks.length} bookmark notes\n`);

    const stats = {
        total: bookmarks.length,
        withCover: 0,
        withLocalCover: 0,
        needsDownload: 0,
        missingCover: 0,
    };

    const toDownload = [];
    const alreadyLocal = [];
    const noCoverUrl = [];

    for (const { data, file } of bookmarks) {
        const title = data.Titel || "Unknown";
        const coverUrl = data.Cover;
        const coverLocal = data["Cover (lokal)"];

        if (coverUrl) stats.withCover++;
        if (coverLocal) stats.withLocalCover++;

        // Already archived locally — skip even if Cover URL is still set,
        // since for bookmarks we keep the URL as a breadcrumb.
        if (coverLocal) {
            const localPath = join(VAULT_PATH, coverLocal);
            if (existsSync(localPath)) {
                alreadyLocal.push({ title, path: coverLocal });
                continue;
            }
        }

        if (!coverUrl) {
            stats.missingCover++;
            noCoverUrl.push({ title, file });
            continue;
        }

        stats.needsDownload++;
        const filename = sanitizeFilename(title);
        toDownload.push({ title, coverUrl, filename, filepath: file });
    }

    console.log("📊 Analysis Results:");
    console.log("-".repeat(60));
    console.log(`Total bookmarks:              ${stats.total}`);
    console.log(`Bookmarks with Cover URL:     ${stats.withCover}`);
    console.log(`Bookmarks with local cover:   ${stats.withLocalCover}`);
    console.log(`Already have local file:      ${alreadyLocal.length}`);
    console.log(`Missing Cover URL:            ${stats.missingCover}`);
    console.log(`Need to download:             ${stats.needsDownload}`);
    console.log();

    if (noCoverUrl.length > 0) {
        console.log("⚠️  Bookmarks without Cover URL (will be skipped):");
        console.log("-".repeat(60));
        noCoverUrl.forEach(({ title }) => console.log(`  • ${title}`));
        console.log();
    }

    if (toDownload.length === 0) {
        console.log("✨ Nothing to download.");
        return;
    }

    if (dryRunMode) {
        console.log("📥 Bookmarks that would be downloaded:");
        console.log("-".repeat(60));
        toDownload.slice(0, 10).forEach(({ title, coverUrl, filename }) => {
            console.log(`  • ${title}`);
            console.log(`    ├─ URL: ${coverUrl}`);
            console.log(`    └─ Save as: ${filename}`);
        });

        if (toDownload.length > 10) {
            console.log(`  ... and ${toDownload.length - 10} more bookmarks`);
        }
        console.log();
        console.log("=".repeat(60));
        console.log("💡 This was a DRY RUN - no files were downloaded or modified");
        console.log("💡 Run without --dry-run to download, or use --test for first 2");
        console.log("=".repeat(60));
        return;
    }

    const downloadList = testMode ? toDownload.slice(0, testCount) : toDownload;

    console.log(`📥 Downloading ${downloadList.length} bookmark covers...`);
    console.log("-".repeat(60));

    const results = { success: 0, cleared: 0, transient: 0, errors: [] };

    for (let i = 0; i < downloadList.length; i++) {
        const { title, coverUrl, filename, filepath } = downloadList[i];
        const destinationPath = join(COVER_DIR, filename);

        process.stdout.write(`[${i + 1}/${downloadList.length}] ${title}... `);

        try {
            const { sizeMB, originalSizeMB, optimized, savedKB } = await downloadCover(
                coverUrl,
                destinationPath
            );

            await updateBookmarkFrontmatter(filepath, destinationPath);

            if (optimized) {
                console.log(
                    `✅ ${sizeMB}MB (optimized from ${originalSizeMB}MB, saved ${savedKB}KB) + frontmatter updated`
                );
            } else {
                console.log(`✅ ${sizeMB}MB + frontmatter updated`);
            }
            results.success++;
        } catch (error) {
            if (error.definitive) {
                // Permanently broken — clear both Cover and Cover (lokal)
                // so re-runs skip this bookmark instead of re-hitting the dead URL.
                await clearBookmarkCover(filepath);
                console.log(`❌ ${error.message} — cleared frontmatter`);
                results.cleared++;
                results.errors.push({
                    title,
                    url: coverUrl,
                    error: error.message,
                    cleared: true,
                });
            } else {
                // Transient (network / 5xx) — leave the URL in place for retry next time.
                console.log(`⏳ ${error.message} — transient, will retry next run`);
                results.transient++;
                results.errors.push({
                    title,
                    url: coverUrl,
                    error: error.message,
                    cleared: false,
                });
            }
        }
    }

    console.log();

    if (results.errors.length > 0) {
        console.log("⚠️  Failed downloads:");
        console.log("-".repeat(60));
        results.errors.forEach(({ title, url, error, cleared }) => {
            console.log(`  • ${title} ${cleared ? "(cleared)" : "(will retry)"}`);
            console.log(`      url:   ${url}`);
            console.log(`      error: ${error}`);
        });
        console.log();
    }

    console.log("=".repeat(60));
    console.log("📋 Download Summary:");
    console.log(`  ✅ Successfully downloaded: ${results.success}`);
    console.log(`  🗑️  Broken (cleared):        ${results.cleared}`);
    console.log(`  ⏳ Transient (will retry):  ${results.transient}`);
    console.log(`  📁 Saved to: ${COVER_DIR}`);
    console.log("=".repeat(60));
}

main().catch((error) => {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
});
