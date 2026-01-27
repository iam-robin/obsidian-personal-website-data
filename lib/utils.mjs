import { readFile } from "fs/promises";
import { glob } from "glob";
import matter from "gray-matter";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const VAULT_PATH = "/Users/robin/Documents/Obsidian/Notes";
export const OUTPUT_PATH = join(__dirname, "../output");

/**
 * Get lastUpdated timestamp - preserves existing timestamp if data unchanged
 */
export async function getLastUpdated(filename, newData) {
    const outputPath = join(OUTPUT_PATH, filename);
    try {
        const existing = JSON.parse(await readFile(outputPath, "utf-8"));
        const { lastUpdated: _, count: __, ...existingData } = existing;
        const { lastUpdated: ___, count: ____, ...newDataOnly } = newData;

        if (JSON.stringify(existingData) === JSON.stringify(newDataOnly)) {
            return existing.lastUpdated; // Data unchanged, keep old timestamp
        }
    } catch (err) {
        // File doesn't exist or parse error - use new timestamp
    }
    return new Date().toISOString();
}

/**
 * Remove wikilink brackets from a value
 * "[[Some Text]]" → "Some Text"
 * Also handles arrays
 */
export function cleanWikilinks(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(cleanWikilinks);
    }

    if (typeof value === "string") {
        return value.replace(/\[\[([^\]]+)\]\]/g, "$1");
    }

    return value;
}

/**
 * Clean all wikilinks in an object's values
 */
export function cleanAllWikilinks(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        cleaned[key] = cleanWikilinks(value);
    }
    return cleaned;
}

/**
 * Parse a markdown file and extract frontmatter
 */
export async function parseMarkdownFile(filePath) {
    const content = await readFile(filePath, "utf-8");
    const { data, content: body } = matter(content);
    return { data, body, filePath };
}

/**
 * Find all markdown files matching a glob pattern
 */
export async function findMarkdownFiles(pattern) {
    return glob(pattern, { cwd: VAULT_PATH, absolute: true });
}

/**
 * Filter files by Kategorie value (supports partial matching)
 */
export function hasKategorie(data, kategorie) {
    const kat = data.Kategorie;
    if (!kat) return false;

    // Kategorie can be a string or array
    const values = Array.isArray(kat) ? kat : [kat];

    // Check if any value includes the search term (after cleaning wikilinks)
    return values.some((v) => {
        const cleaned = cleanWikilinks(v);
        return cleaned.includes(kategorie);
    });
}

/**
 * Normalize a status value to array
 */
export function normalizeStatus(status) {
    if (!status) return [];
    if (Array.isArray(status)) return status.map((s) => cleanWikilinks(s));
    return [cleanWikilinks(status)];
}

/**
 * Convert German frontmatter keys to English for JSON output
 */
export function translateKeys(data, keyMap) {
    const result = {};
    for (const [germanKey, englishKey] of Object.entries(keyMap)) {
        if (data[germanKey] !== undefined) {
            result[englishKey] = cleanWikilinks(data[germanKey]);
        }
    }
    return result;
}

/**
 * Create the standard JSON output structure
 */
export function createOutput(items) {
    return {
        lastUpdated: new Date().toISOString(),
        count: items.length,
        items,
    };
}

/**
 * Write JSON to output file
 */
export async function writeOutput(filename, data) {
    const { writeFile, mkdir } = await import("fs/promises");
    await mkdir(OUTPUT_PATH, { recursive: true });
    const outputPath = join(OUTPUT_PATH, filename);
    await writeFile(outputPath, JSON.stringify(data, null, 2));
    return outputPath;
}
