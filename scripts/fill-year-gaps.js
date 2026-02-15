#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '..', 'src', '_data', 'models.json');
const MODEL_YEARS_PATH = path.join(__dirname, '..', 'src', '_data', 'modelYears.json');

const MAX_YEAR = 2026;
const PRODUCTION_GAP_THRESHOLD = 5; // gaps of 5+ consecutive years are treated as production gaps

// Read data
const models = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf-8'));
const modelYears = JSON.parse(fs.readFileSync(MODEL_YEARS_PATH, 'utf-8'));

// Build a lookup: makeSlug/slug -> sorted array of existing years
const yearsByModel = new Map();
for (const entry of modelYears) {
  const key = `${entry.makeSlug}/${entry.slug}`;
  if (!yearsByModel.has(key)) {
    yearsByModel.set(key, []);
  }
  yearsByModel.get(key).push(entry.year);
}
for (const [key, years] of yearsByModel) {
  years.sort((a, b) => a - b);
}

// Track additions for summary
const additions = [];
let totalAdded = 0;

for (const model of models) {
  const key = `${model.makeSlug}/${model.slug}`;
  const existingYears = yearsByModel.get(key);

  // Only process models that already have some years in modelYears.json
  if (!existingYears || existingYears.length === 0) {
    continue;
  }

  const yearStart = model.yearStart;
  const yearEnd = model.yearEnd === null ? MAX_YEAR : model.yearEnd;

  // Build the set of existing years for fast lookup
  const existingSet = new Set(existingYears);

  // Find all missing years within the expected range
  const allMissing = [];
  for (let y = yearStart; y <= yearEnd; y++) {
    if (!existingSet.has(y)) {
      allMissing.push(y);
    }
  }

  if (allMissing.length === 0) continue;

  // Identify contiguous gaps among the missing years
  // A "gap" is a run of consecutive missing years
  const gaps = [];
  let gapStart = allMissing[0];
  let prev = allMissing[0];
  for (let i = 1; i < allMissing.length; i++) {
    if (allMissing[i] === prev + 1) {
      prev = allMissing[i];
    } else {
      gaps.push({ start: gapStart, end: prev, length: prev - gapStart + 1 });
      gapStart = allMissing[i];
      prev = allMissing[i];
    }
  }
  gaps.push({ start: gapStart, end: prev, length: prev - gapStart + 1 });

  // Filter: only fill gaps shorter than the threshold (1-4 years)
  // Gaps of 5+ years are assumed to be intentional production gaps
  const yearsToAdd = [];
  const skippedGaps = [];
  for (const gap of gaps) {
    if (gap.length >= PRODUCTION_GAP_THRESHOLD) {
      skippedGaps.push(gap);
    } else {
      for (let y = gap.start; y <= gap.end; y++) {
        yearsToAdd.push(y);
      }
    }
  }

  if (yearsToAdd.length === 0) {
    if (skippedGaps.length > 0) {
      console.log(`  SKIPPED ${model.makeName} ${model.name}: ${skippedGaps.length} production gap(s) of 5+ years`);
      for (const g of skippedGaps) {
        console.log(`    -> gap ${g.start}-${g.end} (${g.length} years)`);
      }
    }
    continue;
  }

  // Create new entries for missing years
  const newEntries = yearsToAdd.map(year => ({
    slug: model.slug,
    name: model.name,
    makeSlug: model.makeSlug,
    makeName: model.makeName,
    year,
    bodyType: model.bodyType
  }));

  modelYears.push(...newEntries);
  totalAdded += yearsToAdd.length;
  additions.push({
    model: `${model.makeName} ${model.name}`,
    count: yearsToAdd.length,
    years: yearsToAdd,
    skippedGaps
  });
}

// Sort modelYears for consistent output: by makeSlug, slug, then year descending
modelYears.sort((a, b) => {
  if (a.makeSlug !== b.makeSlug) return a.makeSlug.localeCompare(b.makeSlug);
  if (a.slug !== b.slug) return a.slug.localeCompare(b.slug);
  return b.year - a.year; // descending year (newest first, matching original order)
});

// Write updated file
fs.writeFileSync(MODEL_YEARS_PATH, JSON.stringify(modelYears, null, 2) + '\n', 'utf-8');

// Print summary
console.log('\n========================================');
console.log('  YEAR GAP FILL SUMMARY');
console.log('========================================\n');

if (additions.length === 0) {
  console.log('No gaps found to fill.');
} else {
  console.log(`Models with gaps filled: ${additions.length}`);
  console.log(`Total year entries added: ${totalAdded}\n`);
  console.log('Details:');
  console.log('----------------------------------------');
  for (const a of additions) {
    console.log(`  ${a.model}: +${a.count} year(s)`);
    console.log(`    Added: ${a.years.join(', ')}`);
    if (a.skippedGaps.length > 0) {
      for (const g of a.skippedGaps) {
        console.log(`    (Skipped production gap: ${g.start}-${g.end}, ${g.length} years)`);
      }
    }
  }
  console.log('----------------------------------------');
  console.log(`\nTotal: ${totalAdded} entries added across ${additions.length} model(s)`);
}

console.log('\nUpdated modelYears.json written successfully.');
console.log(`Final entry count: ${modelYears.length}`);
