#!/usr/bin/env node
/**
 * verify-urls.js — Offline URL coverage verification for Car Alpha.
 *
 * Reads all sitemap XML files from the _site build output and tallies
 * the total URL count, broken down by sitemap file.  Validates URL
 * format and exits with code 1 if the total is below 200,000.
 *
 * Usage:
 *   node scripts/verify-urls.js            # reads from _site/
 *   node scripts/verify-urls.js ./custom/   # reads from custom dir
 *
 * No network access required.
 */

const fs = require("fs");
const path = require("path");

const SITE_DIR = process.argv[2] || path.join(__dirname, "..", "_site");
const DOMAIN = "https://www.caralpha.com";
const MIN_URLS = 200000;

function countUrlsInFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const matches = content.match(/<loc>[^<]+<\/loc>/g) || [];
  const urls = matches.map((m) => m.replace(/<\/?loc>/g, ""));
  let valid = 0;
  let invalid = 0;
  for (const url of urls) {
    if (url.startsWith(DOMAIN + "/")) {
      valid++;
    } else {
      invalid++;
      if (invalid <= 5) {
        console.error(`  [WARN] Unexpected URL format: ${url}`);
      }
    }
  }
  return { total: urls.length, valid, invalid };
}

function main() {
  if (!fs.existsSync(SITE_DIR)) {
    console.error(`ERROR: Build output directory not found: ${SITE_DIR}`);
    console.error("Run the build first: node scripts/build-edge-data.js && npx @11ty/eleventy");
    process.exit(1);
  }

  const files = fs.readdirSync(SITE_DIR).filter((f) => f.endsWith(".xml")).sort();

  if (files.length === 0) {
    console.error("ERROR: No XML sitemap files found in " + SITE_DIR);
    process.exit(1);
  }

  let grandTotal = 0;
  let grandValid = 0;
  let grandInvalid = 0;

  console.log("Car Alpha — URL Coverage Report");
  console.log("================================\n");

  for (const file of files) {
    const filePath = path.join(SITE_DIR, file);
    const { total, valid, invalid } = countUrlsInFile(filePath);
    grandTotal += total;
    grandValid += valid;
    grandInvalid += invalid;
    console.log(`  ${file.padEnd(30)} ${String(total).padStart(8)} URLs`);
  }

  console.log("  " + "-".repeat(42));
  console.log(`  ${"TOTAL".padEnd(30)} ${String(grandTotal).padStart(8)} URLs`);
  console.log(`  ${"  Valid".padEnd(30)} ${String(grandValid).padStart(8)}`);
  if (grandInvalid > 0) {
    console.log(`  ${"  Invalid".padEnd(30)} ${String(grandInvalid).padStart(8)}`);
  }
  console.log();

  // Breakdown
  const staticFiles = files.filter((f) => !f.includes("dynamic"));
  const dynamicFiles = files.filter((f) => f.includes("dynamic"));

  let staticTotal = 0;
  for (const file of staticFiles) {
    staticTotal += countUrlsInFile(path.join(SITE_DIR, file)).total;
  }
  let dynamicTotal = 0;
  for (const file of dynamicFiles) {
    dynamicTotal += countUrlsInFile(path.join(SITE_DIR, file)).total;
  }

  console.log("Breakdown:");
  console.log(`  Static sitemaps:  ${staticTotal.toLocaleString()} URLs (${staticFiles.length} files)`);
  console.log(`  Dynamic sitemaps: ${dynamicTotal.toLocaleString()} URLs (${dynamicFiles.length} files)`);
  console.log(`  Combined:         ${grandTotal.toLocaleString()} URLs\n`);

  if (grandTotal >= MIN_URLS) {
    console.log(`PASS: ${grandTotal.toLocaleString()} URLs >= ${MIN_URLS.toLocaleString()} minimum`);
    process.exit(0);
  } else {
    console.log(`WARN: ${grandTotal.toLocaleString()} URLs < ${MIN_URLS.toLocaleString()} minimum`);
    console.log("The 200k target includes dynamic URLs served by edge functions.");
    console.log("Static HTML pages: check with `find _site -name '*.html' | wc -l`");
    process.exit(1);
  }
}

main();
