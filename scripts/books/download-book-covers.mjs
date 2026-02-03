#!/usr/bin/env node

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

const COVER_DIR = join(VAULT_PATH, "Attachments/Book Cover");

// Parse command line arguments
const args = process.argv.slice(2);
const dryRunMode = args.includes("--dry-run");
const testMode = args.includes("--test");
const testCount = testMode ? 2 : 0;

/**
 * Sanitize filename for safe file system storage
 */
function sanitizeFilename(title, author) {
    const firstAuthor = Array.isArray(author) ? author[0] : author || "Unknown";
    const filename = `${title}-${firstAuthor}`
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9-]/g, "-") // Replace special chars with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
        .slice(0, 100); // Limit length

    return `${filename}.jpg`;
}

/**
 * Update book note frontmatter with local cover path and clear Cover URL
 */
async function updateBookFrontmatter(filepath, localCoverPath) {
    const content = await readFile(filepath, "utf-8");
    const { data, content: body } = matter(content);

    // Set Cover (lokal) to relative path from vault root
    const relativePath = relative(VAULT_PATH, localCoverPath);
    data["Cover (lokal)"] = relativePath;

    // Clear the Cover field value (keep key for future updates)
    data.Cover = "";

    // Stringify back to markdown with frontmatter
    const updated = matter.stringify(body, data);
    await writeFile(filepath, updated, "utf-8");
}

/**
 * Download and optimize a cover image from URL
 */
async function downloadCover(url, destinationPath) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
        throw new Error(`Not an image (Content-Type: ${contentType})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Check original file size
    const originalSizeKB = buffer.length / 1024;
    const originalSizeMB = buffer.length / (1024 * 1024);

    if (originalSizeMB > 10) {
        throw new Error(`Image too large (${originalSizeMB.toFixed(2)}MB)`);
    }

    // Ensure directory exists
    await mkdir(COVER_DIR, { recursive: true });

    let optimized = false;
    let finalSizeKB = originalSizeKB;

    // Optimize if image is larger than 100KB
    if (originalSizeKB > 100) {
        try {
            const optimizedBuffer = await sharp(buffer)
                .resize(600, 900, {
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .jpeg({ quality: 85 })
                .toBuffer();

            buffer = optimizedBuffer;
            finalSizeKB = buffer.length / 1024;
            optimized = true;
        } catch (error) {
            // If optimization fails, use original
            console.warn(`    ⚠️  Optimization failed, using original: ${error.message}`);
        }
    }

    // Write file
    await writeFile(destinationPath, buffer);

    return {
        size: buffer.length,
        sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
        originalSizeMB: originalSizeMB.toFixed(2),
        optimized,
        savedKB: optimized ? (originalSizeKB - finalSizeKB).toFixed(0) : 0,
    };
}

/**
 * Main function - analyze and optionally download book covers
 */
async function main() {
    const mode = dryRunMode ? "DRY RUN" : testMode ? "TEST" : "FULL DOWNLOAD";
    console.log(`🔍 Book Cover Download Script - ${mode} MODE`);
    console.log("=".repeat(60));
    console.log();

    // Find all markdown files
    console.log("📚 Searching for book notes...");
    const files = await findMarkdownFiles("**/*.md");

    // Parse and filter for books
    const books = [];
    for (const file of files) {
        const { data } = await parseMarkdownFile(file);
        if (hasKategorie(data, "Bücher")) {
            books.push({ data, file });
        }
    }

    console.log(`✅ Found ${books.length} book notes\n`);

    // Analyze each book
    const stats = {
        total: books.length,
        withCover: 0,
        withLocalCover: 0,
        needsDownload: 0,
        missingCover: 0,
    };

    const toDownload = [];
    const alreadyLocal = [];
    const noCoverUrl = [];

    for (const { data, file } of books) {
        const title = data.Titel || "Unknown";
        const author = data.Autor || "Unknown";
        const coverUrl = data.Cover;
        const coverLocal = data["Cover (lokal)"];

        if (coverUrl) stats.withCover++;
        if (coverLocal) stats.withLocalCover++;

        // Check if cover URL exists
        if (!coverUrl) {
            // No URL provided
            if (coverLocal) {
                const localPath = join(VAULT_PATH, coverLocal);
                if (existsSync(localPath)) {
                    // Has local cover, no URL to download - skip
                    alreadyLocal.push({ title, author, path: coverLocal });
                    continue;
                }
            }
            // No URL and no valid local cover
            stats.missingCover++;
            noCoverUrl.push({ title, author, file });
            continue;
        }

        // This book needs downloading
        stats.needsDownload++;
        const filename = sanitizeFilename(title, author);
        toDownload.push({
            title,
            author,
            coverUrl,
            filename,
            filepath: file,
        });
    }

    // Display results
    console.log("📊 Analysis Results:");
    console.log("-".repeat(60));
    console.log(`Total books:                ${stats.total}`);
    console.log(`Books with Cover URL:       ${stats.withCover}`);
    console.log(`Books with local cover:     ${stats.withLocalCover}`);
    console.log(`Already have local file:    ${alreadyLocal.length}`);
    console.log(`Missing Cover URL:          ${stats.missingCover}`);
    console.log(`Need to download:           ${stats.needsDownload}`);
    console.log();

    // Show books that already have local covers
    if (alreadyLocal.length > 0) {
        console.log("✅ Books with existing local covers:");
        console.log("-".repeat(60));
        alreadyLocal.forEach(({ title, author, path }) => {
            console.log(`  • ${title} - ${author}`);
            console.log(`    └─ ${path}`);
        });
        console.log();
    }

    // Show books missing cover URLs
    if (noCoverUrl.length > 0) {
        console.log("⚠️  Books without Cover URL (will be skipped):");
        console.log("-".repeat(60));
        noCoverUrl.forEach(({ title, author }) => {
            console.log(`  • ${title} - ${author}`);
        });
        console.log();
    }

    // Show what would be downloaded (or download them)
    if (toDownload.length > 0) {
        if (dryRunMode) {
            console.log("📥 Books that would be downloaded:");
            console.log("-".repeat(60));
            toDownload.slice(0, 10).forEach(({ title, author, coverUrl, filename }) => {
                console.log(`  • ${title} - ${author}`);
                console.log(`    ├─ URL: ${coverUrl}`);
                console.log(`    └─ Save as: ${filename}`);
            });

            if (toDownload.length > 10) {
                console.log(`  ... and ${toDownload.length - 10} more books`);
            }
            console.log();
        } else {
            // Actually download covers
            const downloadList = testMode
                ? toDownload.slice(0, testCount)
                : toDownload;

            console.log(`📥 Downloading ${downloadList.length} book covers...`);
            console.log("-".repeat(60));

            const results = {
                success: 0,
                failed: 0,
                errors: [],
            };

            for (let i = 0; i < downloadList.length; i++) {
                const { title, author, coverUrl, filename, filepath } = downloadList[i];
                const destinationPath = join(COVER_DIR, filename);

                process.stdout.write(
                    `[${i + 1}/${downloadList.length}] ${title}... `
                );

                try {
                    const { sizeMB, originalSizeMB, optimized, savedKB } = await downloadCover(
                        coverUrl,
                        destinationPath
                    );

                    // Update frontmatter with local cover path and remove external URL
                    await updateBookFrontmatter(filepath, destinationPath);

                    if (optimized) {
                        console.log(
                            `✅ ${sizeMB}MB (optimized from ${originalSizeMB}MB, saved ${savedKB}KB) + frontmatter updated`
                        );
                    } else {
                        console.log(`✅ ${sizeMB}MB + frontmatter updated`);
                    }
                    results.success++;
                } catch (error) {
                    console.log(`❌ ${error.message}`);
                    results.failed++;
                    results.errors.push({ title, author, error: error.message });
                }
            }

            console.log();

            // Show errors if any
            if (results.errors.length > 0) {
                console.log("⚠️  Failed downloads:");
                console.log("-".repeat(60));
                results.errors.forEach(({ title, author, error }) => {
                    console.log(`  • ${title} - ${author}`);
                    console.log(`    └─ Error: ${error}`);
                });
                console.log();
            }

            console.log("=".repeat(60));
            console.log("📋 Download Summary:");
            console.log(`  ✅ Successfully downloaded: ${results.success}`);
            console.log(`  ❌ Failed: ${results.failed}`);
            console.log(`  📁 Saved to: ${COVER_DIR}`);
            console.log("=".repeat(60));

            return;
        }
    }

    // Summary (dry-run mode)
    console.log("=".repeat(60));
    console.log("📋 Summary:");
    console.log(`  • ${alreadyLocal.length} books already have local covers`);
    console.log(`  • ${stats.needsDownload} books need to be downloaded`);
    console.log(`  • ${stats.missingCover} books have no cover URL`);
    console.log();
    console.log("💡 This was a DRY RUN - no files were downloaded or modified");
    console.log("💡 Run without --dry-run flag to download, or use --test to download 2 books");
    console.log("=".repeat(60));
}

// Run the script
main().catch((error) => {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
});
