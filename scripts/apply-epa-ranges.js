#!/usr/bin/env node
"use strict";

/**
 * Replace sampled fueleconomy.gov figures with the full configuration range
 * from vehicles.csv, and drop catalog years that EPA does not list and that
 * have no NHTSA recall, complaint, or star rating in the dated snapshot.
 *
 * The CSV is the public EPA download:
 * https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { rowMatchesModel } = require("./build-vehicle-facts");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "src", "_data");
const CSV = process.env.EPA_CSV || "/tmp/epa/vehicles.csv";
const ZIP = "/tmp/epa/vehicles.csv.zip";

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function ensureCsv() {
  if (fs.existsSync(CSV)) return;
  fs.mkdirSync(path.dirname(CSV), { recursive: true });
  if (!fs.existsSync(ZIP)) {
    execFileSync("curl", ["-fsSL", "-o", ZIP, "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip"], { stdio: "inherit" });
  }
  execFileSync("unzip", ["-o", ZIP, "-d", path.dirname(CSV)], { stdio: "inherit" });
}

function main() {
  ensureCsv();
  const models = JSON.parse(fs.readFileSync(path.join(DATA, "models.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(DATA, "modelYears.json"), "utf8"));
  const factsFile = JSON.parse(fs.readFileSync(path.join(DATA, "vehicleFacts.json"), "utf8"));
  const vehicles = factsFile.vehicles || {};

  const byMake = new Map();
  for (const model of models) {
    const make = norm(model.makeName);
    if (!byMake.has(make)) byMake.set(make, []);
    byMake.get(make).push(model);
  }
  for (const list of byMake.values()) {
    list.sort(function (a, b) { return norm(b.name).length - norm(a.name).length; });
  }

  const table = parseCsv(fs.readFileSync(CSV, "utf8"));
  const header = table[0];
  const index = {};
  header.forEach(function (name, i) { index[name] = i; });
  const need = ["year", "make", "model", "baseModel", "city08", "highway08", "comb08", "displ", "cylinders", "drive", "trany"];
  for (const name of need) {
    if (index[name] == null) throw new Error("EPA CSV missing column " + name);
  }

  const buckets = new Map();
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (!row || row.length < header.length) continue;
    const year = Number(row[index.year]);
    const makeNorm = norm(row[index.make]);
    const catalog = byMake.get(makeNorm);
    if (!catalog || !year) continue;
    const epaModel = row[index.model] || "";
    const base = row[index.baseModel] || "";
    const epaRow = {
      model: epaModel,
      baseModel: base,
      fuelType1: index.fuelType1 != null ? row[index.fuelType1] || "" : "",
    };
    const matches = catalog.filter(function (model) { return rowMatchesModel(model, epaRow); });
    if (!matches.length) continue;
    const comb = Number(row[index.comb08]);
    const city = Number(row[index.city08]);
    const hwy = Number(row[index.highway08]);
    if (!comb) continue;
    matches.forEach(function (match) {
      const key = match.makeSlug + "/" + match.slug + "/" + year;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { rows: [] };
        buckets.set(key, bucket);
      }
      bucket.rows.push({
        name: epaModel,
        comb: comb,
        city: city,
        hwy: hwy,
        displ: row[index.displ] || "",
        cylinders: row[index.cylinders] || "",
        drive: row[index.drive] || "",
        trans: row[index.trany] || "",
      });
    });
  }

  const epaKeys = ["cityMin", "cityMax", "hwyMin", "hwyMax", "combMin", "combMax", "epaConfigs", "epaLow", "epaHigh", "epaName", "displ", "cylinders", "drive", "trans", "epaTrims"];
  const catalogKeys = new Set(modelYears.map(function (entry) {
    return entry.makeSlug + "/" + entry.slug + "/" + entry.year;
  }));
  const epaYearsByModel = new Map();
  for (const key of buckets.keys()) {
    const parts = key.split("/");
    const year = Number(parts.pop());
    const modelKey = parts.join("/");
    if (!epaYearsByModel.has(modelKey)) epaYearsByModel.set(modelKey, new Set());
    epaYearsByModel.get(modelKey).add(year);
  }

  let updated = 0;
  for (const [key, bucket] of buckets) {
    if (!catalogKeys.has(key)) continue;
    const rows = bucket.rows;
    const fact = vehicles[key] || {};
    for (const field of epaKeys) delete fact[field];
    const combs = rows.map(function (item) { return item.comb; });
    const cities = rows.map(function (item) { return item.city; }).filter(Boolean);
    const hwys = rows.map(function (item) { return item.hwy; }).filter(Boolean);
    fact.combMin = Math.min.apply(null, combs);
    fact.combMax = Math.max.apply(null, combs);
    if (cities.length) {
      fact.cityMin = Math.min.apply(null, cities);
      fact.cityMax = Math.max.apply(null, cities);
    }
    if (hwys.length) {
      fact.hwyMin = Math.min.apply(null, hwys);
      fact.hwyMax = Math.max.apply(null, hwys);
    }
    fact.epaConfigs = rows.length;
    const low = rows.reduce(function (a, b) { return a.comb <= b.comb ? a : b; });
    const high = rows.reduce(function (a, b) { return a.comb >= b.comb ? a : b; });
    if (rows.length === 1) {
      fact.epaName = low.name;
      if (low.displ) fact.displ = low.displ;
      if (low.cylinders) fact.cylinders = Number(low.cylinders);
      if (low.drive) fact.drive = low.drive;
      if (low.trans) fact.trans = low.trans;
    } else {
      fact.epaLow = low.name;
      fact.epaHigh = high.name;
    }
    vehicles[key] = fact;
    updated += 1;
  }

  const absent = [];
  const keptWithoutEpa = [];
  const nextYears = [];
  for (const entry of modelYears) {
    const key = entry.makeSlug + "/" + entry.slug + "/" + entry.year;
    const modelKey = entry.makeSlug + "/" + entry.slug;
    if (buckets.has(key)) {
      nextYears.push(entry);
      continue;
    }
    const covered = epaYearsByModel.get(modelKey);
    const fact = vehicles[key];
    const recalls = fact && Number(fact.recalls) > 0;
    const complaints = fact && Number(fact.complaints) > 0;
    const stars = fact && Number(fact.starsMin) > 0;
    let interiorGap = false;
    if (covered && covered.size && !recalls && !complaints && !stars) {
      const years = Array.from(covered);
      const min = Math.min.apply(null, years);
      const max = Math.max.apply(null, years);
      interiorGap = entry.year > min && entry.year < max && !covered.has(entry.year);
    }
    if (interiorGap) {
      absent.push(key);
      delete vehicles[key];
      continue;
    }
    keptWithoutEpa.push(key);
    nextYears.push(entry);
  }

  factsFile.vehicles = vehicles;
  fs.writeFileSync(path.join(DATA, "vehicleFacts.json"), JSON.stringify(factsFile));
  fs.writeFileSync(path.join(DATA, "modelYears.json"), JSON.stringify(nextYears, null, 2) + "\n");
  fs.writeFileSync(path.join(DATA, "absentModelYears.json"), JSON.stringify({
    reason: "No fueleconomy.gov configuration in the September 29, 2026 vehicles.csv download, and the October 23, 2026 NHTSA snapshot has no recall, complaint, or star rating.",
    years: absent.sort(),
  }, null, 2) + "\n");

  const camry = vehicles["toyota/camry/2020"];
  const civic = vehicles["honda/civic/2022"];
  console.log("EPA ranges written for " + updated + " model years");
  console.log("catalog years kept without EPA: " + keptWithoutEpa.length);
  console.log("catalog years removed: " + absent.length);
  absent.forEach(function (key) { console.log("  drop " + key); });
  console.log("2020 Camry", JSON.stringify(camry));
  console.log("2022 Civic", JSON.stringify(civic));
  console.log("2021 MDX still present", nextYears.some(function (row) { return row.makeSlug === "acura" && row.slug === "mdx" && row.year === 2021; }));
}

main();
