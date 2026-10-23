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
