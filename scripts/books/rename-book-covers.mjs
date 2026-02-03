#!/usr/bin/env node

import { existsSync } from "fs";
import { rename, readFile, writeFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";
import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    VAULT_PATH,
} from "../../lib/utils.mjs";

const COVER_DIR = join(VAULT_PATH, "Attachments/Book Cover");

/**
 * Sanitize filename for safe file system storage (same as download script)
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
 * Rename cover file and update book frontmatter
 */
async function renameBookCover(filepath, title, author, currentPath) {
    // Get expected filename
    const expectedFilename = sanitizeFilename(title, author);
    const currentFilename = basename(currentPath);

    // Check if already correct (case-sensitive comparison)
    if (currentFilename === expectedFilename) {
        return { renamed: false, reason: "already correct" };
    }

    // Build full paths
    const currentFullPath = join(VAULT_PATH, currentPath);
    const newFullPath = join(COVER_DIR, expectedFilename);
    const newRelativePath = `Attachments/Book Cover/${expectedFilename}`;

    // Check if current file exists
    if (!existsSync(currentFullPath)) {
        return { renamed: false, reason: "file not found", currentFullPath };
    }

    // For case-only changes on case-insensitive filesystems (macOS):
    // Use two-step rename via temporary file
    const needsCaseOnlyRename = currentFilename.toLowerCase() === expectedFilename.toLowerCase();

    if (needsCaseOnlyRename) {
        const tempPath = join(COVER_DIR, `temp-${Date.now()}-${expectedFilename}`);
        await rename(currentFullPath, tempPath);
        await rename(tempPath, newFullPath);
    } else {
        // Check if target already exists (different file)
        if (existsSync(newFullPath)) {
            return {
                renamed: false,
                reason: "target exists",
                currentFilename,
                expectedFilename,
            };
        }
        await rename(currentFullPath, newFullPath);
    }

    // Update frontmatter
    const content = await readFile(filepath, "utf-8");
    const { data, content: body } = matter(content);
    data["Cover (lokal)"] = newRelativePath;
    const updated = matter.stringify(body, data);
    await writeFile(filepath, updated, "utf-8");

    return {
        renamed: true,
        oldFilename: currentFilename,
        newFilename: expectedFilename,
        oldPath: currentPath,
        newPath: newRelativePath,
    };
}

/**
 * Main function - rename all book covers to follow naming convention
 */
async function main() {
    console.log("🔄 Book Cover Rename Script");
    console.log("=".repeat(60));
    console.log();

    // Find all markdown files
    console.log("📚 Searching for book notes...");
    const files = await findMarkdownFiles("**/*.md");

    // Parse and filter for books with local covers
    const booksWithCovers = [];
    for (const file of files) {
        const { data } = await parseMarkdownFile(file);
        if (hasKategorie(data, "Bücher") && data["Cover (lokal)"]) {
            booksWithCovers.push({
                title: data.Titel || "Unknown",
                author: data.Autor || "Unknown",
                coverLocal: data["Cover (lokal)"],
                filepath: file,
            });
        }
    }

    console.log(`✅ Found ${booksWithCovers.length} books with local covers\n`);

    // Process each book
    console.log("🔧 Checking and renaming covers...");
    console.log("-".repeat(60));

    const stats = {
        total: booksWithCovers.length,
        renamed: 0,
        alreadyCorrect: 0,
        errors: 0,
        errorDetails: [],
    };

    for (let i = 0; i < booksWithCovers.length; i++) {
        const { title, author, coverLocal, filepath } = booksWithCovers[i];

        process.stdout.write(`[${i + 1}/${booksWithCovers.length}] ${title}... `);

        try {
            const result = await renameBookCover(
                filepath,
                title,
                author,
                coverLocal
            );

            if (result.renamed) {
                stats.renamed++;
                console.log(`✅ Renamed`);
                console.log(`    From: ${result.oldFilename}`);
                console.log(`    To:   ${result.newFilename}`);
            } else if (result.reason === "already correct") {
                stats.alreadyCorrect++;
                console.log(`✓ Already correct`);
            } else {
                stats.errors++;
                console.log(`⚠️  ${result.reason}`);
                stats.errorDetails.push({ title, author, ...result });
            }
        } catch (error) {
            stats.errors++;
            console.log(`❌ Error: ${error.message}`);
            stats.errorDetails.push({ title, author, error: error.message });
        }
    }

    console.log();

    // Show errors if any
    if (stats.errorDetails.length > 0) {
        console.log("⚠️  Issues encountered:");
        console.log("-".repeat(60));
        stats.errorDetails.forEach(({ title, author, reason, error }) => {
            console.log(`  • ${title} - ${author}`);
            console.log(`    └─ ${reason || error}`);
        });
        console.log();
    }

    console.log("=".repeat(60));
    console.log("📋 Rename Summary:");
    console.log(`  Total books with covers:   ${stats.total}`);
    console.log(`  Renamed:                   ${stats.renamed}`);
    console.log(`  Already correct:           ${stats.alreadyCorrect}`);
    console.log(`  Errors/Skipped:            ${stats.errors}`);
    console.log("=".repeat(60));
}

// Run the script
main().catch((error) => {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
});
