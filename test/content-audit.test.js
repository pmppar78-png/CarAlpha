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
