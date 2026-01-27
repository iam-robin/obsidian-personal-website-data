#!/usr/bin/env node

import {
  findMarkdownFiles,
  parseMarkdownFile,
  hasKategorie,
  translateKeys,
  normalizeStatus,
  writeOutput,
  getLastUpdated,
} from './lib/utils.mjs';

// Map German frontmatter keys to English JSON keys
const KEY_MAP = {
  'Titel': 'title',
  'Staffel': 'season',
  'Genre': 'genre',
  'Regisseur': 'director',
  'Bewertung': 'rating',
  'scoreImdb': 'imdbScore',
  'cast': 'cast',
  'Cover': 'cover',
  'Erschienen': 'released',
  'Beendet': 'finished',
  'Hinzugefügt': 'added',
  'Favorit': 'favorite'
};

async function exportSeries() {
  console.log('Exporting series...');

  // Find all markdown files (series could be in Notes or elsewhere)
  const files = await findMarkdownFiles('**/*.md');
  const series = [];

  for (const filePath of files) {
    try {
      const { data } = await parseMarkdownFile(filePath);

      // Skip if not a series or is a template
      if (!hasKategorie(data, 'Serien')) continue;
      if (filePath.includes('Template')) continue;

      // Translate keys and clean wikilinks
      const show = translateKeys(data, KEY_MAP);

      // Handle status separately (normalize to array)
      show.status = normalizeStatus(data.Status);

      // Ensure genre is always an array
      if (show.genre && !Array.isArray(show.genre)) {
        show.genre = [show.genre];
      }

      // Ensure cast is always an array
      if (show.cast && !Array.isArray(show.cast)) {
        show.cast = [show.cast];
      }

      // Parse rating as number if possible
      if (show.rating) {
        const parsed = parseFloat(show.rating);
        show.rating = isNaN(parsed) ? show.rating : parsed;
      }

      // Parse imdbScore as number if possible
      if (show.imdbScore) {
        const parsed = parseFloat(show.imdbScore);
        show.imdbScore = isNaN(parsed) ? show.imdbScore : parsed;
      }

      // Parse season as number if possible
      if (show.season) {
        const parsed = parseInt(show.season, 10);
        show.season = isNaN(parsed) ? show.season : parsed;
      }

      series.push(show);
    } catch (err) {
      console.error(`  Error processing ${filePath}: ${err.message}`);
    }
  }

  // Group by status
  const aktiv = [];
  const merkliste = [];
  const pausiert = [];
  const abgeschlossen = {};

  for (const show of series) {
    const status = show.status?.[0] || '';

    if (status === 'Aktiv') {
      aktiv.push(show);
    } else if (status === 'Merkliste') {
      merkliste.push(show);
    } else if (status === 'Pausiert') {
      pausiert.push(show);
    } else if (status === 'Abgeschlossen') {
      // Extract year from finished date
      const finishedDate = show.finished ? new Date(show.finished) : null;
      const year = finishedDate ? String(finishedDate.getFullYear()) : 'unknown';

      if (!abgeschlossen[year]) {
        abgeschlossen[year] = [];
      }
      abgeschlossen[year].push(show);
    }
  }

  // Sort each array by finished date (most recent first)
  const sortByFinished = (a, b) => {
    const aDate = a.finished ? String(a.finished) : '';
    const bDate = b.finished ? String(b.finished) : '';
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
    .forEach(year => {
      sortedAbgeschlossen[year] = abgeschlossen[year];
    });

  const dataForComparison = {
    aktiv,
    merkliste,
    pausiert,
    abgeschlossen: sortedAbgeschlossen,
  };

  const output = {
    lastUpdated: await getLastUpdated("series.json", dataForComparison),
    count: series.length,
    ...dataForComparison,
  };

  const outputPath = await writeOutput('series.json', output);

  console.log(`  Exported ${series.length} series to ${outputPath}`);
  console.log(`    - Aktiv: ${aktiv.length}`);
  console.log(`    - Merkliste: ${merkliste.length}`);
  console.log(`    - Pausiert: ${pausiert.length}`);
  console.log(`    - Abgeschlossen: ${Object.keys(sortedAbgeschlossen).length} years`);
  return output;
}

// Run if called directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMainModule || process.argv[1]?.endsWith('export-series.mjs')) {
  exportSeries().catch(console.error);
}

export { exportSeries };
