#!/usr/bin/env node
"use strict";

/**
 * Re-reads NHTSA's own text for campaigns whose stored summary, consequence
 * or remedy came out broken when an all-caps record was lowercased: a
 * sentence that starts lowercase, a make or month left lowercase, or a cut
 * after "Inc." / "Corp.". Each campaign is fetched once from
 * recalls/campaignNumber and rewritten with clipRecord, the same reader
 * enrich-vehicle-facts.js uses, in every year record that lists it.
 */

const fs = require("fs");
const path = require("path");
const { clipRecord } = require("./enrich-vehicle-facts");

const OUT = path.join(__dirname, "..", "src", "_data", "vehicleFacts.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOWER_NAMES = /\b(january|february|march|april|june|july|august|september|october|november|december|toyota|honda|ford|chevrolet|buick|cadillac|gmc|lexus|nissan|dodge|chrysler|jeep|hyundai|kia|mazda|subaru|volkswagen|acura|infiniti|lincoln|mercury|pontiac|saturn|hummer|ram)\b/;

function broken(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  return /(^|[.!?] )[a-z]/.test(s) || /\b(Gm|Inc|Co|Corp|Ltd)\.?$/.test(s) || LOWER_NAMES.test(s);
}

async function campaign(id) {
  const url = "https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=" + encodeURIComponent(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        const row = (data.results || []).find((r) => r.NHTSACampaignNumber === id) || (data.results || [])[0];
        if (row) return row;
      }
    } catch (_err) { /* retry */ }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

async function main() {
  const facts = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const byId = new Map();
  for (const rec of Object.values(facts.years)) {
    for (const row of (rec.recalls && rec.recalls.campaigns) || []) {
      if (broken(row.summary) || broken(row.consequence) || broken(row.remedy)) {
        if (!byId.has(row.id)) byId.set(row.id, []);
        byId.get(row.id).push(row);
      }
    }
  }
  let fixed = 0, missed = 0;
  for (const [id, rows] of byId) {
    const src = await campaign(id);
    await sleep(200);
    if (!src) { missed += 1; continue; }
    const text = { summary: clipRecord(src.Summary), consequence: clipRecord(src.Consequence), remedy: clipRecord(src.Remedy) };
    for (const row of rows) Object.assign(row, text);
    fixed += 1;
  }
  fs.writeFileSync(OUT, JSON.stringify(facts));
  console.log(`campaigns re-read ${fixed}, unreachable ${missed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
