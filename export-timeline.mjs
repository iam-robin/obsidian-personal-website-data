#!/usr/bin/env node

import {
    findMarkdownFiles,
    parseMarkdownFile,
    hasKategorie,
    translateKeys,
    writeOutput,
    getLastUpdated,
} from "./lib/utils.mjs";

// Map German frontmatter keys to English JSON keys
const KEY_MAP = {
    Titel: "title",
    Typ: "type",
    Beginn: "start",
    Ende: "end",
    Bereich: "domain",
    Schlagwörter: "tags",
    Hinzugefügt: "added",
};

async function exportTimeline() {
    console.log("Exporting timeline...");

    // Find all markdown files
    const files = await findMarkdownFiles("**/*.md");
    const entries = [];

    for (const filePath of files) {
        try {
            const { data } = await parseMarkdownFile(filePath);

            // Skip if not a timeline entry or is a template
            if (!hasKategorie(data, "Timeline")) continue;
            if (filePath.includes("Template")) continue;

            // Translate keys and clean wikilinks
            const entry = translateKeys(data, KEY_MAP);

            // Ensure tags is always an array
            if (entry.tags && !Array.isArray(entry.tags)) {
                entry.tags = [entry.tags];
            }

            entries.push(entry);
        } catch (err) {
            console.error(`  Error processing ${filePath}: ${err.message}`);
        }
    }

    // Sort entries by start date (oldest first for timeline)
    entries.sort((a, b) => {
        const aDate = a.start ? String(a.start) : "";
        const bDate = b.start ? String(b.start) : "";
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.localeCompare(bDate);
    });

    // Group entries by type
    const byType = {};
    for (const entry of entries) {
        const type = entry.type || "unknown";
        if (!byType[type]) {
            byType[type] = [];
        }
        byType[type].push(entry);
    }

    const dataForComparison = {
        entries,
        byType,
    };

    const output = {
        lastUpdated: await getLastUpdated("timeline.json", dataForComparison),
        count: entries.length,
        ...dataForComparison,
    };

    const outputPath = await writeOutput("timeline.json", output);

    console.log(
        `  Exported ${entries.length} timeline entries to ${outputPath}`,
    );
    for (const [type, items] of Object.entries(byType)) {
        console.log(`    - ${type}: ${items.length}`);
    }
    return output;
}

// Run if called directly
const isMainModule =
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMainModule || process.argv[1]?.endsWith("export-timeline.mjs")) {
    exportTimeline().catch(console.error);
}

export { exportTimeline };
