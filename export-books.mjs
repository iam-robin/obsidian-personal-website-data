#!/usr/bin/env node

import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename, dirname } from "path";
import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    translateKeys,
    normalizeStatus,
    writeOutput,
    getLastUpdated,
    VAULT_PATH,
} from "./lib/utils.mjs";

const COVERS_DIR = join(dirname(new URL(import.meta.url).pathname), "output", "book-covers");
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/iam-robin/obsidian-personal-website-data/main/output/book-covers";

// Map German frontmatter keys to English JSON keys
const KEY_MAP = {
    Titel: "title",
    Autor: "author",
    Seiten: "pages",
    Erschienen: "published",
    Cover: "cover",
    "Cover (lokal)": "coverLocal",
    isbn: "isbn",
    Verlag: "publisher",
    Genre: "genre",
    Beendet: "finished",
    Bewertung: "rating",
    Hinzugefügt: "added",
};

async function exportBooks() {
    console.log("Exporting books...");

    // Find all markdown files in Clippings/Books
    const files = await findMarkdownFiles("**/*.md");
    const books = [];

    for (const filePath of files) {
        try {
            const { data } = await parseMarkdownFile(filePath);

            // Skip if not a book or is a template
            if (!hasKategorie(data, "Bücher")) continue;
            if (filePath.includes("Template")) continue;

            // Translate keys and clean wikilinks
            const book = translateKeys(data, KEY_MAP);

            // Handle status separately (normalize to array)
            book.status = normalizeStatus(data.Status);

            // Ensure author is always an array
            if (book.author && !Array.isArray(book.author)) {
                book.author = [book.author];
            }

            // Ensure genre is always an array
            if (book.genre && !Array.isArray(book.genre)) {
                book.genre = [book.genre];
            }

            // Parse pages as number if possible
            if (book.pages) {
                const parsed = parseInt(book.pages, 10);
                book.pages = isNaN(parsed) ? book.pages : parsed;
            }

            // Parse rating as number if possible
            if (book.rating) {
                const parsed = parseFloat(book.rating);
                book.rating = isNaN(parsed) ? book.rating : parsed;
            }

            // Handle cover field: copy local cover and generate GitHub URL
            if (book.coverLocal) {
                try {
                    // Build full paths
                    const sourcePath = join(VAULT_PATH, book.coverLocal);
                    const filename = basename(book.coverLocal);
                    const destPath = join(COVERS_DIR, filename);

                    // Ensure covers directory exists
                    await mkdir(COVERS_DIR, { recursive: true });

                    // Copy file if source exists
                    if (existsSync(sourcePath)) {
                        await copyFile(sourcePath, destPath);
                        // Set cover to GitHub raw URL
                        book.cover = `${GITHUB_RAW_BASE}/${filename}`;
                    } else {
                        console.warn(`  Warning: Cover file not found: ${sourcePath}`);
                        book.cover = null;
                    }
                } catch (error) {
                    console.error(`  Error copying cover for ${book.title}: ${error.message}`);
                    book.cover = null;
                }
                // Remove coverLocal from final output
                delete book.coverLocal;
            } else if (book.cover) {
                // External URL exists but no local cover - keep it (shouldn't happen after migration)
                delete book.coverLocal;
            } else {
                // No cover at all
                book.cover = null;
                delete book.coverLocal;
            }

            books.push(book);
        } catch (err) {
            console.error(`  Error processing ${filePath}: ${err.message}`);
        }
    }

    // Group by status
    const aktiv = [];
    const merkliste = [];
    const pausiert = [];
    const abgeschlossen = {};

    for (const book of books) {
        const status = book.status?.[0] || "";

        if (status === "Aktiv") {
            aktiv.push(book);
        } else if (status === "Merkliste") {
            merkliste.push(book);
        } else if (status === "Pausiert") {
            pausiert.push(book);
        } else if (status === "Abgeschlossen") {
            // Extract year from finished date
            const finishedDate = book.finished ? new Date(book.finished) : null;
            const year = finishedDate
                ? String(finishedDate.getFullYear())
                : "unknown";

            if (!abgeschlossen[year]) {
                abgeschlossen[year] = [];
            }
            abgeschlossen[year].push(book);
        }
    }

    // Sort each array by finished date (most recent first)
    const sortByFinished = (a, b) => {
        const aDate = a.finished ? String(a.finished) : "";
        const bDate = b.finished ? String(b.finished) : "";
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate.localeCompare(aDate);
    };

    aktiv.sort(sortByFinished);
    merkliste.sort(sortByFinished);
    pausiert.sort(sortByFinished);

    // Sort within each year
    for (const year of Object.keys(abgeschlossen)) {
        abgeschlossen[year].sort(sortByFinished);
    }

    // Sort years descending (most recent first)
    const sortedAbgeschlossen = {};
    Object.keys(abgeschlossen)
        .sort((a, b) => b.localeCompare(a))
        .forEach((year) => {
            sortedAbgeschlossen[year] = abgeschlossen[year];
        });

    const dataForComparison = {
        aktiv,
        merkliste,
        pausiert,
        abgeschlossen: sortedAbgeschlossen,
    };

    const output = {
        lastUpdated: await getLastUpdated("books.json", dataForComparison),
        count: books.length,
        ...dataForComparison,
    };

    const outputPath = await writeOutput("books.json", output);

    console.log(`  Exported ${books.length} books to ${outputPath}`);
    console.log(`    - Aktiv: ${aktiv.length}`);
    console.log(`    - Merkliste: ${merkliste.length}`);
    console.log(`    - Pausiert: ${pausiert.length}`);
    console.log(
        `    - Abgeschlossen: ${Object.keys(sortedAbgeschlossen).length} years`
    );
    return output;
}

// Run if called directly
const isMainModule =
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMainModule || process.argv[1]?.endsWith("export-books.mjs")) {
    exportBooks().catch(console.error);
}

export { exportBooks };
