"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const path = require("node:path");

const copySrc = fs.readFileSync(path.join(__dirname, "..", "lib", "vehicle-copy.js"), "utf8");

test("vehicle copy has no seal or oneSentence helper", () => {
  assert.doesNotMatch(copySrc, /function seal\b/);
  assert.doesNotMatch(copySrc, /function oneSentence\b/);
  assert.doesNotMatch(copySrc, /sealed/);
});

test("2020 Camry copy uses recorded facts and the 15-year remedy limit", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  const entry = data.modelYears.find((row) => row.makeSlug === "toyota" && row.slug === "camry" && row.year === 2020);
  assert.ok(entry, "2020 Camry is in the catalog");
  const copy = vehicleCopy.yearCopy(entry);
  assert.equal(copy.indexable, true);
  assert.doesNotMatch(copy.plain, /Rolls-Royce|Saturn Ion|Ghost/i);
  assert.doesNotMatch(copy.plain, /;\s+[a-z]/);
  assert.match(copy.plain, /fueleconomy\.gov/i);
  assert.doesNotMatch(copy.plain, /fueleconomy\.gov vehicle id/i);
  assert.doesNotMatch(copy.plain, /not a loan rate/i);
  assert.doesNotMatch(copy.plain, /Not Rated/i);
  assert.doesNotMatch(copy.plain, /SEATS:/);
  const remedy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "recallRemedy.json"), "utf8"));
  const yearTemplate = fs.readFileSync(path.join(__dirname, "..", "src", "makes", "model-year.njk"), "utf8");
  assert.match(remedy.text, /30120\(g\)\(1\)/);
  assert.match(remedy.text, /15 calendar years/);
  assert.match(yearTemplate, /recall-remedy\.njk/);
  assert.ok(copy.facts && copy.facts.epa, "EPA rows are present");
  assert.ok(copy.plain.split(/\s+/).length > 40, "the Camry year page keeps a factual body");
  assert.equal(typeof copy.ctx.ordinal, "number");
  assert.ok(copy.ctx.ordinal >= 1 && copy.ctx.ordinal <= copy.ctx.total);
});

test("recall labels stay in plain English", () => {
  const { plainRecallLabel } = require("../lib/recall-labels");
  const banned = /[:/]|\b(other|foundation|components)\b/i;
  assert.equal(plainRecallLabel("LATCHES/LOCKS/LINKAGES:DOORS:LATCH"), "door latch");
  assert.equal(plainRecallLabel("EQUIPMENT:OTHER:LABELS"), "incorrect label");
  assert.equal(plainRecallLabel("AIR BAGS:FRONTAL:PASSENGER SIDE:INFLATOR MODULE"), "front passenger air bag inflator");
  assert.equal(plainRecallLabel("SERVICE BRAKES, HYDRAULIC:FOUNDATION COMPONENTS:MASTER CYLINDER"), "brake master cylinder");
  assert.equal(plainRecallLabel("BACK OVER PREVENTION:SENSING SYSTEM:CAMERA"), "rearview camera");
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  let longest = 0;
  for (const rec of Object.values(data.yearFacts)) {
    const campaigns = rec.recalls && rec.recalls.campaigns;
    if (!campaigns) continue;
    longest = Math.max(longest, campaigns.length);
    assert.equal(campaigns.length, rec.recalls.count);
    for (const row of campaigns) {
      const label = plainRecallLabel(row.component, row.summary);
      assert.equal(banned.test(label), false, `${row.component} -> ${label}`);
    }
  }
  assert.ok(longest > 8, "at least one model year keeps more than 8 campaigns");
});

test("one EPA configuration count drives the year record and the vehicle summary", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  const evoque = data.yearFacts["land-rover/evoque/2020"];
  const evoqueVehicle = data.vehicles["land-rover/evoque/2020"];
  assert.ok(evoque && evoque.epa && evoque.epa.configs.length);
  assert.equal(evoque.epa.count, evoque.epa.configs.length);
  assert.equal(evoqueVehicle.epaConfigs, evoque.epa.count);
  for (const row of evoque.epa.configs) {
    assert.match(row.name, /evoque/i);
    assert.doesNotMatch(row.name, /sport|velar|\bLWB\b/i);
  }
  assert.doesNotMatch(`${evoqueVehicle.epaLow || ""} ${evoqueVehicle.epaHigh || ""} ${evoqueVehicle.epaName || ""}`, /Range Rover LWB|Range Rover Sport/);
  let compared = 0;
  for (const [key, rec] of Object.entries(data.yearFacts)) {
    if (!rec.epa || !rec.epa.configs) continue;
    assert.equal(rec.epa.count, rec.epa.configs.length, key);
    const vehicle = data.vehicles[key];
    if (vehicle && vehicle.epaConfigs != null) {
      assert.equal(vehicle.epaConfigs, rec.epa.count, key);
      compared += 1;
    }
    if (vehicle && rec.epa.comb) {
      assert.equal(vehicle.combMin, rec.epa.comb[0], key);
      assert.equal(vehicle.combMax, rec.epa.comb[1], key);
    }
  }
  assert.ok(compared > 100, "configuration counts were compared on year pages");
});

test("annual fuel cost uses the fueleconomy.gov price dated on the table", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  const yearTemplate = fs.readFileSync(path.join(__dirname, "..", "src", "makes", "model-year.njk"), "utf8");
  assert.match(yearTemplate, /Annual fuel as of/);
  const priceKey = {
    "Regular Gasoline": "regular",
    "Premium Gasoline": "premium",
    "Midgrade Gasoline": "midgrade",
    Diesel: "diesel",
  };
  let checked = 0;
  for (const rec of Object.values(data.yearFacts)) {
    const epa = rec.epa;
    if (!epa || !epa.configs || !epa.fuelPrices) continue;
    assert.equal(epa.fuelCostAsOf, "October 23, 2026");
    for (const row of epa.configs) {
      if (row.fuelCostSource !== "fueleconomy.gov fuelprices") continue;
      const price = epa.fuelPrices[priceKey[row.fuel]];
      const expected = Math.round((price * (15000 / row.comb)) / 50) * 50;
      assert.equal(row.fuelCost, expected, `${row.name} ${row.comb}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, "refreshed fuel costs were checked");
  const civic = data.yearFacts["honda/civic/2020"];
  const match = civic && civic.epa.configs.find((row) => row.city === 30 && row.hwy === 38 && row.comb === 33 && row.co2 === 266);
  assert.ok(match, "2020 Civic 30/38/33 configuration is on the page");
  assert.equal(match.fuelCost, 1950);
});

test("lemon pages drop the repeated sentences and keep a forum for each state", () => {
  const template = fs.readFileSync(path.join(__dirname, "..", "src", "states", "state-lemon-law.njk"), "utf8");
  [
    "If a number of repair attempts decides the case",
    "lemon-law hub",
    "National Association of Attorneys General",
    "Where the",
    "nationwide repair-count test",
    "a {{ state.name }} claim",
  ].forEach((phrase) => assert.equal(template.includes(phrase), false, phrase));
  const states = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "states.json"), "utf8"));
  states.forEach((state) => {
    if (!state.hasLemonLaw) return;
    const blob = [state.lemonLawSummary, state.usedCarLemonLaw, state.lemonArbitration].filter(Boolean).join(" ");
    assert.match(state.lemonLawSummary, /repair|attempt|days/i, state.slug);
    assert.match(blob, /arbitration|lawsuit|civil action|court|suit|hearing|informal dispute/i, state.slug);
  });
});

test("a year with no EPA, recall, complaint, or NCAP rating is noindex and off the sitemap", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  const sitemap = fs.readFileSync(path.join(__dirname, "..", "src", "sitemap-modelyears.njk"), "utf8");
  assert.match(sitemap, /indexableYear/);
  const required = [
    ["lotus", "evora", 2015],
    ["lotus", "evora", 2016],
    ["lotus", "evora", 2019],
    ["maserati", "granturismo", 2023],
    ["bentley", "continental-gt", 2019],
  ];
  required.forEach(([makeSlug, slug, year]) => {
    const entry = data.modelYears.find((row) => row.makeSlug === makeSlug && row.slug === slug && row.year === year);
    assert.ok(entry, `${makeSlug}/${slug}/${year} is in the catalog`);
    const rec = data.yearFacts[`${makeSlug}/${slug}/${year}`] || {};
    const epa = rec.epa && (Number(rec.epa.count) > 0 || (rec.epa.configs && rec.epa.configs.length > 0));
    const recalls = rec.recalls && (Number(rec.recalls.count) > 0 || (rec.recalls.campaigns && rec.recalls.campaigns.length > 0));
    const complaints = rec.complaints && Number(rec.complaints.count) > 0;
    const ncap = rec.ncap && (rec.ncap.rows || []).some((row) => /^[1-5]$/.test(String(row.overall == null ? "" : row.overall).trim()));
    assert.equal(Boolean(epa || recalls || complaints || ncap), false, `${makeSlug}/${slug}/${year} has a real source`);
    assert.equal(vehicleCopy.yearIndexable(entry), false, `${makeSlug}/${slug}/${year} stays indexable`);
    assert.equal(vehicleCopy.yearCopy(entry).indexable, false);
  });
  data.modelYears.forEach((entry) => {
    const rec = data.yearFacts[`${entry.makeSlug}/${entry.slug}/${entry.year}`];
    if (!rec) {
      assert.equal(vehicleCopy.yearIndexable(entry), false);
      return;
    }
    const epa = rec.epa && (Number(rec.epa.count) > 0 || (rec.epa.configs && rec.epa.configs.length > 0));
    const recalls = rec.recalls && (Number(rec.recalls.count) > 0 || (rec.recalls.campaigns && rec.recalls.campaigns.length > 0));
    const complaints = rec.complaints && Number(rec.complaints.count) > 0;
    const ncap = rec.ncap && (rec.ncap.rows || []).some((row) => /^[1-5]$/.test(String(row.overall == null ? "" : row.overall).trim()));
    assert.equal(vehicleCopy.yearIndexable(entry), Boolean(epa || recalls || complaints || ncap), `${entry.makeSlug}/${entry.slug}/${entry.year}`);
  });
});

test("a catalog year with no recorded source is noindex copy", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  const missing = data.modelYears.find((row) => !data.yearFacts[`${row.makeSlug}/${row.slug}/${row.year}`]);
  if (!missing) return;
  const copy = vehicleCopy.yearCopy(missing);
  assert.equal(copy.indexable, false);
  assert.equal(copy.faqs.length, 0);
  assert.ok(copy.plain.split(/\s+/).length < 8);
});

test("generation and rival sentences read as prose", () => {
  const vehicleCopy = require("../lib/vehicle-copy");
  const data = vehicleCopy.load();
  assert.doesNotMatch(copySrc, /Wikipedia infobox places/);
  assert.doesNotMatch(copySrc, /when combined mileage runs/);
  const malibu = data.modelYears.find((row) => row.makeSlug === "chevrolet" && row.slug === "malibu" && row.year === 2004);
  const malibuCopy = vehicleCopy.yearCopy(malibu);
  assert.match(malibuCopy.plain, /According to the Wikipedia infobox, the 2004 Chevrolet Malibu is the first model year of the Sixth generation, which ran from 2004 to 2007\./);
  const camry = data.modelYears.find((row) => row.makeSlug === "toyota" && row.slug === "camry" && row.year === 2020);
  const camryCopy = vehicleCopy.yearCopy(camry);
  assert.match(camryCopy.plain, /According to the Wikipedia infobox, the 2020 Toyota Camry is the third model year of the XV70, which ran from 2018 to 2024\./);
  assert.match(camryCopy.plain, /Other .+ models sold for 2020 include .+\. Fueleconomy\.gov combined mileage for this model runs .+ mpg\./);
  const rivalFaq = camryCopy.faqs.find((faq) => faq.q === "Which same-year rivals are on file?");
  assert.ok(rivalFaq);
  assert.match(rivalFaq.a, /^Other /);
  assert.equal(camryCopy.faqSchema.mainEntity.find((item) => item.name === rivalFaq.q).acceptedAnswer.text, rivalFaq.a);
});

test("years that were never sold are removed and redirected", () => {
  const absent = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "absentModelYears.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "modelYears.json"), "utf8"));
  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  const never = [
    "chevrolet/colorado/2013",
    "chevrolet/colorado/2014",
    "kia/sorento/2010",
    "lexus/lx/2012",
    "mercury/sable/2006",
    "mercury/sable/2007",
    "mini/clubman/2015",
    "oldsmobile/aurora/2000",
    "mitsubishi/eclipse-cross/2021",
    "bentley/flying-spur/2019",
    "maserati/granturismo/2020",
    "maserati/granturismo/2021",
    "maserati/granturismo/2022",
  ];
  const keys = new Set(modelYears.map((row) => `${row.makeSlug}/${row.slug}/${row.year}`));
  for (const id of never) {
    assert.equal(keys.has(id), false, id);
    assert.ok(absent.years.includes(id), id);
    const [make, model, year] = id.split("/");
    const target = `/makes/${make}/${model}/`;
    for (const from of [`/makes/${make}/${model}/${year}`, `/makes/${make}/${model}/${year}/`, `/makes/${make}/${model}/${year}/*`]) {
      assert.match(toml, new RegExp(`from = "${from.replace(/\*/g, "\\*")}"\\n  to = "${target}"\\n  status = 301\\n  force = true`));
    }
  }
});

test("vehicle photos are licensed Commons files with dimensions and a credit", () => {
  const images = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "vehicleImages.json"), "utf8"));
  const allow = /^(CC BY|CC BY-SA|CC0|Public domain|PD)/i;
  const partial = fs.readFileSync(path.join(__dirname, "..", "src", "_includes", "partials", "vehicle-photo.njk"), "utf8");
  const makeTemplate = fs.readFileSync(path.join(__dirname, "..", "src", "makes", "make.njk"), "utf8");
  const modelTemplate = fs.readFileSync(path.join(__dirname, "..", "src", "makes", "model.njk"), "utf8");
  assert.match(partial, /loading="lazy"/);
  assert.match(partial, /figcaption/);
  assert.match(partial, /width="\{\{ photo\.width \}\}"/);
  assert.match(partial, /height="\{\{ photo\.height \}\}"/);
  assert.match(makeTemplate, /vehicle-photo\.njk/);
  assert.match(modelTemplate, /vehicle-photo\.njk/);
  const photos = Object.values(images.makes || {}).concat(Object.values(images.models || {}));
  assert.ok(Object.keys(images.makes || {}).length >= 30, "make pages keep a licensed photo when Commons has one");
  assert.ok(Object.keys(images.models || {}).length >= 40, "model pages keep a licensed photo when Commons has one");
  for (const photo of photos) {
    assert.match(photo.license, allow, photo.license);
    assert.doesNotMatch(photo.license, /NC|ND/i);
    assert.ok(photo.width > 0 && photo.height > 0);
    assert.ok(photo.alt && photo.author && photo.source);
    assert.match(photo.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(photo.src, /^\/assets\/images\/vehicles\/.+\.webp$/);
    assert.equal(fs.existsSync(path.join(__dirname, "..", "src", photo.src)), true, photo.src);
  }
  assert.match(partial, /, cropped and resized/);
});

function filenameModelYears(file) {
  let text = String(file).replace(/^File:/, "").replace(/\.[A-Za-z0-9]+$/, "");
  text = text.replace(/\b[A-Za-z]*\d[A-Za-z]+\d+[A-Za-z0-9]*\b/g, " ");
  text = text.replace(/\b\d{2}-\d{2}-(19|20)\d{2}\b/g, " ");
  text = text.replace(/\b(19|20)\d{2}[-/]\d{2}[-/]\d{2}\b/g, " ");
  text = text.replace(/\b\d{2}-(19|20)\d{6}\b/g, " ");
  text = text.replace(/\b(19|20)\d{6,}\b/g, " ");
  const found = new Set();
  for (const match of text.matchAll(/\b((?:19|20)\d{2})\s*[-–]\s*(\d{2,4})\b/g)) {
    const start = Number(match[1]);
    let end = Number(match[2]);
    if (end < 100) end = Math.floor(start / 100) * 100 + end;
    if (end < start) end += 100;
    for (let year = start; year <= Math.min(end, start + 14); year += 1) found.add(year);
  }
  for (const match of text.matchAll(/(?:^|[^\d])'(\d{2})\b/g)) {
    const number = Number(match[1]);
    found.add(number >= 30 ? 1900 + number : 2000 + number);
  }
  for (const match of text.matchAll(/(?:^|[\s(])(\d{2})\s*[-–]\s*(\d{2})(?!\d)/g)) {
    const toYear = (number) => (number >= 30 ? 1900 + number : 2000 + number);
    const start = toYear(Number(match[1]));
    const end = toYear(Number(match[2]));
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    for (let year = low; year <= Math.min(high, low + 11); year += 1) found.add(year);
  }
  for (const match of text.matchAll(/(?:^|[\s(])(\d{2})[- ](?=[A-Z])/g)) {
    const number = Number(match[1]);
    if (number >= 1 && number <= 26) found.add(2000 + number);
  }
  const stripped = text.replace(/\b((?:19|20)\d{2})\s*[-–]\s*\d{2,4}\b/g, " ");
  for (const match of stripped.matchAll(/\b((?:19|20)\d{2})\b/g)) found.add(Number(match[1]));
  return [...found];
}

test("model photo years fall inside the page years or the generation matches", () => {
  const images = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "vehicleImages.json"), "utf8"));
  const models = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "models.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "_data", "modelYears.json"), "utf8"));
  const spans = {};
  for (const row of modelYears) {
    const key = `${row.makeSlug}/${row.slug}`;
    if (!spans[key]) spans[key] = [row.year, row.year];
    spans[key][0] = Math.min(spans[key][0], row.year);
    spans[key][1] = Math.max(spans[key][1], row.year);
  }
  const byKey = new Map(models.map((row) => [`${row.makeSlug}/${row.slug}`, row]));
  for (const [key, photo] of Object.entries(images.models)) {
    const [min, max] = spans[key];
    const model = byKey.get(key);
    assert.equal(typeof photo.year, "number", key);
    assert.ok(photo.generation, key);
    assert.equal(typeof photo.generationStart, "number", key);
    const end = photo.generationEnd == null ? max : photo.generationEnd;
    const generationMatches = photo.generationStart <= max && end >= min;
    const yearMatches = photo.year >= min && photo.year <= max;
    assert.ok(yearMatches || generationMatches, `${key} ${photo.year} ${photo.generation} is outside ${min}-${max}`);
    const named = filenameModelYears(photo.file);
    if (named.length) assert.ok(named.includes(photo.year), `${key} records ${photo.year} but the filename years are ${named.join(",")}`);
    const alt = photo.alt.toLowerCase().replace(/-/g, " ");
    const generation = String(photo.generation).toLowerCase().replace(/-/g, " ");
    assert.ok(alt.includes(String(photo.year)) || alt.includes(generation), photo.alt);
    assert.doesNotMatch(photo.alt, /\bvehicle$/i, photo.alt);
    const name = model.name.toLowerCase().replace(/-/g, " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(alt, new RegExp(name), photo.alt);
  }
  for (const photo of Object.values(images.makes)) {
    assert.doesNotMatch(photo.alt, /\bvehicle$/i, photo.alt);
    assert.ok(photo.alt.split(/\s+/).length >= 2, photo.alt);
  }
});

test("recall summaries never print the NHTSA 'see the recall report' pointer", () => {
  const { oneSentence } = require("../lib/recall-labels");
  const out = oneSentence("Toyota Motor Engineering & Manufacturing (Toyota) is recalling certain 2022-2026 Toyota, Lexus, and Subaru Solterra vehicles equipped with a Panoramic View Monitor (PVM) system. Please see the recall report for a complete list of models.");
  assert.doesNotMatch(out, /recall report/i);
  assert.match(out, /Panoramic View Monitor/);
});
