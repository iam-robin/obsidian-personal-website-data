#!/usr/bin/env node

import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename, dirname } from "path";
import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    translateKeys,
    writeOutput,
    getLastUpdated,
    VAULT_PATH,
} from "./lib/utils.mjs";

const COVERS_DIR = join(
    dirname(new URL(import.meta.url).pathname),
    "output",
    "bookmark-covers"
);
const GITHUB_RAW_BASE = "bookmark-covers"; // Relative path for website build

// Map German frontmatter keys to English JSON keys.
// Favorit is deliberately omitted — it's used for filtering, not exported.
const KEY_MAP = {
    Titel: "title",
    Quelle: "url",
    Hinzugefügt: "added",
    Cover: "cover",
    "Cover (lokal)": "coverLocal",
    Tags: "tags",
    description: "description",
};

async function exportBookmarks() {
    console.log("Exporting bookmarks...");

    const files = await findMarkdownFiles("**/*.md");
    const bookmarks = [];

    for (const filePath of files) {
        try {
            const { data } = await parseMarkdownFile(filePath);

            // Skip if not a bookmark or is a template
            if (!hasKategorie(data, "Bookmarks")) continue;
            if (filePath.includes("Template")) continue;

            // Favorit gate: only `Favorit: true` bookmarks are published.
            // Strict boolean equality — gray-matter parses YAML `true` to a real bool.
            if (data.Favorit !== true) continue;

            // Translate keys and clean wikilinks
            const bookmark = translateKeys(data, KEY_MAP);

            // Ensure tags is always an array
            if (!bookmark.tags) {
                bookmark.tags = [];
            } else if (!Array.isArray(bookmark.tags)) {
                bookmark.tags = [bookmark.tags];
            }

            // Handle cover field: copy local cover and generate relative URL
            if (bookmark.coverLocal) {
                try {
                    const sourcePath = join(VAULT_PATH, bookmark.coverLocal);
                    const filename = basename(bookmark.coverLocal);
                    const destPath = join(COVERS_DIR, filename);

                    await mkdir(COVERS_DIR, { recursive: true });

                    if (existsSync(sourcePath)) {
                        await copyFile(sourcePath, destPath);
                        bookmark.cover = `${GITHUB_RAW_BASE}/${filename}`;
                    } else {
                        console.warn(
                            `  Warning: Cover file not found: ${sourcePath}`
                        );
                        bookmark.cover = null;
                    }
                } catch (error) {
                    console.error(
                        `  Error copying cover for ${bookmark.title}: ${error.message}`
                    );
                    bookmark.cover = null;
                }
                delete bookmark.coverLocal;
            } else {
                // No local cover archived — do not publish the remote URL.
                bookmark.cover = null;
                delete bookmark.coverLocal;
            }

            bookmarks.push(bookmark);
        } catch (err) {
            console.error(`  Error processing ${filePath}: ${err.message}`);
        }
    }

    // Sort by added date descending (most recently favorited first)
    bookmarks.sort((a, b) => {
        const aDate = a.added ? String(a.added) : "";
        const bDate = b.added ? String(b.added) : "";
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate.localeCompare(aDate);
    });

    const dataForComparison = { items: bookmarks };

    const output = {
        lastUpdated: await getLastUpdated("bookmarks.json", dataForComparison),
        count: bookmarks.length,
        ...dataForComparison,
    };

    const outputPath = await writeOutput("bookmarks.json", output);

    console.log(`  Exported ${bookmarks.length} bookmarks to ${outputPath}`);
    return output;
}

// Run if called directly
const isMainModule =
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMainModule || process.argv[1]?.endsWith("export-bookmarks.mjs")) {
    exportBookmarks().catch(console.error);
}

export { exportBookmarks };
