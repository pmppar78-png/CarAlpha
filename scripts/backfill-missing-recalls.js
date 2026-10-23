#!/usr/bin/env node
"use strict";

/**
 * Year records with no "recalls" key were left that way when the NHTSA
 * request failed during the facts build, so their pages print no campaigns
 * even when recallsByVehicle lists some. This re-requests only those
 * records (with retries and a pause between calls) and writes the same
 * campaign shape enrich-vehicle-facts.js produces. A record stays without
 * a "recalls" key if NHTSA still cannot be reached, so a failure is never
 * published as "no recalls".
 */

const fs = require("fs");
const path = require("path");
const { recallFromCache, cacheFile } = require("./enrich-vehicle-facts");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "_data", "vehicleFacts.json");
const MODELS = path.join(ROOT, "src", "_data", "models.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRecalls(make, model, year) {
  const url = "https://api.nhtsa.gov/recalls/recallsByVehicle?make=" + encodeURIComponent(make) +
    "&model=" + encodeURIComponent(model) + "&modelYear=" + year;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      // recallsByVehicle answers 400 with an empty result set for a model/year it has no rows for.
      if (res.status === 400) return { results: [] };
      if (res.ok) return await res.json();
    } catch (_err) { /* retry */ }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

async function main() {
  const facts = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const models = new Map(JSON.parse(fs.readFileSync(MODELS, "utf8")).map((m) => [m.makeSlug + "/" + m.slug, m]));
  let filled = 0, empty = 0, failed = 0;
  for (const [key, rec] of Object.entries(facts.years)) {
    if (rec.recalls) continue;
    const [makeSlug, modelSlug, year] = key.split("/");
    const model = models.get(makeSlug + "/" + modelSlug);
    if (!model) continue;
    const data = await fetchRecalls(model.makeName, model.name, year);
    await sleep(250);
    if (!data) { failed += 1; continue; }
    const file = cacheFile("recalls", model.makeName, model.name, year);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    const full = recallFromCache(model.makeName, model.name, year);
    if (full && full.campaigns.length) { rec.recalls = full; filled += 1; } else { empty += 1; }
  }
  fs.writeFileSync(OUT, JSON.stringify(facts));
  console.log(`recalls backfilled ${filled}, confirmed none ${empty}, still unreachable ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
