import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename, dirname, extname } from "path";
import sharp from "sharp";
import { VAULT_PATH } from "./utils.mjs";

// Covers live in the vault; the export copies them here for the website.
const VAULT_COVER_DIR = "attachments/book-cover";
const OUTPUT_COVER_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "output", "book-covers");

// The Book Search plugin saves Google's tiny thumbnails (~128px wide).
// Anything narrower than this gets swapped for a larger Open Library cover.
const MIN_WIDTH = 200;
const MAX_SIZE = { width: 1000, height: 1500 };

export function slugify(value) {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function download(url) {
    const res = await fetch(url, { headers: { Accept: "image/*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

async function toJpeg(buffer) {
    return sharp(buffer)
        .resize({ ...MAX_SIZE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
}

async function findOpenLibraryCover(title, authors) {
    const params = new URLSearchParams({ title, limit: "1", fields: "cover_i" });
    if (authors?.[0]) params.set("author", authors[0]);
    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!res.ok) return null;
    const id = (await res.json()).docs?.[0]?.cover_i;
    return id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false` : null;
}

/**
 * Make sure a book's cover is a local file in the vault and return its
 * vault-relative path, or null.
 *
 * - A URL in `cover` is downloaded into the vault; `changed` tells the caller
 *   to write the new path back into the note.
 * - A tiny local cover (plugin thumbnail) is replaced in place by a larger
 *   Open Library cover, keeping the file name so the note stays untouched.
 */
export async function ensureLocalCover(book) {
    const cover = typeof book.cover === "string" ? book.cover.trim() : "";
    if (!cover) return { path: null, changed: false };

    if (/^https?:\/\//.test(cover)) {
        const authors = [].concat(book.author || []);
        const name = slugify([book.title, ...authors].join(" ")) || "cover";
        const path = `${VAULT_COVER_DIR}/${name}.jpg`;
        await mkdir(join(VAULT_PATH, VAULT_COVER_DIR), { recursive: true });
        await writeFile(join(VAULT_PATH, path), await toJpeg(await download(cover)));
        console.log(`  Downloaded cover for ${book.title}`);
        return { path, changed: true };
    }

    const full = join(VAULT_PATH, cover);
    if (!existsSync(full)) {
        console.warn(`  Warning: Cover file not found: ${cover}`);
        return { path: null, changed: false };
    }

    const { width } = await sharp(full).metadata();
    if (width && width < MIN_WIDTH) {
        try {
            const url = await findOpenLibraryCover(book.title, [].concat(book.author || []));
            if (url) {
                const larger = await toJpeg(await download(url));
                if ((await sharp(larger).metadata()).width > width) {
                    await writeFile(full, larger);
                    console.log(`  Upgraded small cover for ${book.title}`);
                }
            }
        } catch (err) {
            console.warn(`  Could not upgrade cover for ${book.title}: ${err.message}`);
        }
    }

    return { path: cover, changed: false };
}

/**
 * Copy a vault cover into the website output (only when it changed) and
 * return the path the website expects.
 */
export async function publishCover(vaultPath) {
    const ext = extname(vaultPath).toLowerCase() || ".jpg";
    const file = slugify(basename(vaultPath, extname(vaultPath))) + ext;
    const dest = join(OUTPUT_COVER_DIR, file);
    const source = await readFile(join(VAULT_PATH, vaultPath));

    await mkdir(OUTPUT_COVER_DIR, { recursive: true });
    if (!existsSync(dest) || !source.equals(await readFile(dest))) {
        await writeFile(dest, source);
    }
    return `book-covers/${file}`;
}

/** Dominant colour of a cover as a hex string, used as the spine colour. */
export async function dominantColor(vaultPath) {
    const { dominant } = await sharp(join(VAULT_PATH, vaultPath)).stats();
    return "#" + [dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** Replace the `cover` value in a note's frontmatter, leaving everything else as is. */
export async function writeCoverToNote(filePath, coverPath) {
    const text = await readFile(filePath, "utf8");
    const updated = text.replace(/^(---\n[\s\S]*?)^cover:.*(?:\n[ \t]+.*)*$/m,`$1cover: ${coverPath}`);
    if (updated !== text) await writeFile(filePath, updated);
}
