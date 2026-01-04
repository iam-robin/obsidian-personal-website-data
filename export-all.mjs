#!/usr/bin/env node

import { exportBooks } from './export-books.mjs';
import { exportSeries } from './export-series.mjs';

async function exportAll() {
  console.log('=== Obsidian Data Export ===\n');

  const results = {};

  try {
    results.books = await exportBooks();
  } catch (err) {
    console.error('Failed to export books:', err.message);
  }

  try {
    results.series = await exportSeries();
  } catch (err) {
    console.error('Failed to export series:', err.message);
  }

  // Summary
  console.log('\n=== Export Complete ===');
  console.log(`Books: ${results.books?.count ?? 0} items`);
  console.log(`Series: ${results.series?.count ?? 0} items`);
  console.log(`\nOutput: scripts/output/`);
}

exportAll().catch(console.error);
