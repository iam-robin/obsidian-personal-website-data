#!/usr/bin/env node

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    VAULT_PATH,
} from "../../lib/utils.mjs";

/**
 * Clean up book note frontmatter
 * - Remove Cover field (external URL)
 * - Ensure Cover (lokal) is set (to path or empty string)
 */
async function cleanupBookFrontmatter(filepath) {
    const content = await readFile(filepath, "utf-8");
    const { data, content: body } = matter(content);

    const currentCoverLocal = data["Cover (lokal)"];
    const currentCover = data.Cover;

    // Check if a local cover file exists
    let localCoverPath = null;
    if (currentCoverLocal) {
        const fullPath = join(VAULT_PATH, currentCoverLocal);
        if (existsSync(fullPath)) {
            localCoverPath = currentCoverLocal;
        }
    }

    // Update frontmatter
    if (localCoverPath) {
        // Has local cover - keep path, clear Cover URL
        data["Cover (lokal)"] = localCoverPath;
    } else {
        // No local cover - set to empty string
        data["Cover (lokal)"] = "";
    }

    // Always clear Cover field value (keep key for future updates)
    data.Cover = "";

    // Check if changes were made
    const hadCover = currentCover !== undefined;
    const hadCorrectLocal = currentCoverLocal === (localCoverPath || "");
    const needsCoverField = currentCover !== ""; // Cover field missing or has value
    const changed = needsCoverField || !hadCorrectLocal;

    if (changed) {
        // Write updated frontmatter
        const updated = matter.stringify(body, data);
        await writeFile(filepath, updated, "utf-8");
    }

    return {
        changed,
        hadCover,
        hasLocalCover: localCoverPath !== null,
        localCoverPath,
    };
}

/**
 * Main function - clean up all book notes
 */
async function main() {
    console.log("🧹 Book Cover Frontmatter Cleanup Script");
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
            books.push({
                title: data.Titel || "Unknown",
                author: data.Autor || "Unknown",
                filepath: file,
            });
        }
    }

    console.log(`✅ Found ${books.length} book notes\n`);

    // Clean up each book
    console.log("🔧 Cleaning up frontmatter...");
    console.log("-".repeat(60));

    const stats = {
        total: books.length,
        changed: 0,
        removedCover: 0,
        withLocalCover: 0,
        withoutLocalCover: 0,
    };

    for (let i = 0; i < books.length; i++) {
        const { title, filepath } = books[i];

        process.stdout.write(`[${i + 1}/${books.length}] ${title}... `);

        try {
            const result = await cleanupBookFrontmatter(filepath);

            if (result.changed) {
                stats.changed++;
                if (result.hadCover) stats.removedCover++;
            }

            if (result.hasLocalCover) {
                stats.withLocalCover++;
                console.log(`✅ Has local cover`);
            } else {
                stats.withoutLocalCover++;
                console.log(`⚪ No local cover`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }

    console.log();
    console.log("=".repeat(60));
    console.log("📋 Cleanup Summary:");
    console.log(`  Total books processed:     ${stats.total}`);
    console.log(`  Books with local covers:   ${stats.withLocalCover}`);
    console.log(`  Books without covers:      ${stats.withoutLocalCover}`);
    console.log(`  Frontmatter updated:       ${stats.changed}`);
    console.log(`  Cover field removed:       ${stats.removedCover}`);
    console.log();
    console.log("✅ All books now have consistent frontmatter structure!");
    console.log("=".repeat(60));
}

// Run the script
main().catch((error) => {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
});
