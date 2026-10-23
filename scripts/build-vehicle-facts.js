#!/usr/bin/env node
"use strict";

/**
 * Builds src/_data/vehicleFacts.json from public sources:
 * - EPA fuel economy rows (fueleconomy.gov vehicles.csv.zip)
 * - NHTSA recallsByVehicle and SafetyRatings
 * - Wikipedia infobox model_years, kept only when the ranges do not overlap
 *
 * Pages are indexable only when at least one of those sources matched.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "_data", "vehicleFacts.json");
const CACHE = "/tmp/vehicle-facts-cache";
const EPA_ZIP = "/tmp/vehicles.csv.zip";
const EPA_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip";
const CONCURRENCY = 10;
const RETRIEVED = "2026-10-23";

const MAKE_EPA = {
  mclaren: "mclarenautomotive",
};

const BASE_ALIASES = {
  "mercedes-benz/gle": ["gleclass"],
  "mercedes-benz/glc": ["glcclass"],
  "mercedes-benz/gla": ["glaclass"],
  "volkswagen/golf": ["golfgti"],
  "saab/9-2x": ["92"],
  "saab/9-7x": ["97"],
  "pontiac/firebird": ["firebirdtransamformula"],
  "mazda/mx-5-miata": ["mx5", "mx5miata"],
  "mazda/mazda3": ["3"],
  "ferrari/812": ["812superfast", "812gts", "812competizione"],
  "isuzu/hombre": ["hombrepickup"],
  "polestar/polestar-2": ["2"],
  "polestar/polestar-3": ["3"],
  "polestar/polestar-4": ["4"],
  "aston-martin/dbx": ["dbxv8", "dbx707", "dbx727"],
  "aston-martin/db12": ["db12v8", "db12s"],
  "bentley/continental-gt": ["continental", "continentalgtconvertible"],
  "lotus/elise": ["eliseexige"],
  "lotus/exige": ["eliseexige"],
  "fiat/500x": ["500x"],
};

const ROW_FILTERS = {
  "volkswagen/atlas": (row) => /atlas/i.test(row.model) && !/cross sport/i.test(row.model),
  "volkswagen/atlas-cross-sport": (row) => /cross sport/i.test(row.model),
  "buick/encore": (row) => /encore/i.test(row.model) && !/\bgx\b/i.test(row.model),
  "buick/encore-gx": (row) => /encore gx/i.test(row.model),
  "mitsubishi/outlander": (row) => /outlander/i.test(row.model) && !/sport/i.test(row.model),
  "mitsubishi/outlander-sport": (row) => /outlander sport/i.test(row.model),
  "land-rover/range-rover": (row) => /range rover/i.test(row.model) && !/sport|evoque|velar/i.test(row.model),
  "land-rover/range-rover-sport": (row) => /range rover sport/i.test(row.model),
  "land-rover/evoque": (row) => /evoque/i.test(row.model),
  "land-rover/velar": (row) => /velar/i.test(row.model),
  "fiat/500": (row) => /\b500\b/i.test(row.model) && !/500x|500e/i.test(row.model),
  "fiat/500x": (row) => /500x/i.test(row.model),
  "mini/cooper-se": (row) => /cooper/i.test(row.baseModel) && /electric/i.test(row.fuelType1 || ""),
};

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1) rows.push(row);
  }
  const header = rows.shift();
  return rows.map((cells) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = cells[idx] || "";
    });
    return obj;
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function loadEpaRows() {
  if (!fs.existsSync(EPA_ZIP)) {
    execFileSync("curl", ["-fsSL", "-o", EPA_ZIP, EPA_URL], { stdio: "inherit" });
  }
  const csv = execFileSync("unzip", ["-p", EPA_ZIP, "vehicles.csv"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  return parseCsv(csv);
}

function indexEpa(rows) {
  const byMake = new Map();
  for (const row of rows) {
    const make = norm(row.make);
    if (!byMake.has(make)) byMake.set(make, []);
    byMake.get(make).push(row);
  }
  return byMake;
}

function rowsForModel(model, byMake) {
  const makeKey = MAKE_EPA[norm(model.makeName)] || norm(model.makeName);
  const pool = byMake.get(makeKey) || [];
  const id = `${model.makeSlug}/${model.slug}`;
  const aliases = new Set(BASE_ALIASES[id] || []);
  aliases.add(norm(model.name));
  const filter = ROW_FILTERS[id];
  const matched = [];
  for (const row of pool) {
    const base = norm(row.baseModel);
    if (filter) {
      if (!filter(row)) continue;
    } else if (!aliases.has(base)) {
      continue;
    }
    const year = Number(row.year);
    if (!year) continue;
    matched.push(row);
  }
  return matched;
}

function summarizeEpa(rows) {
  const byYear = new Map();
  for (const row of rows) {
    const year = Number(row.year);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(row);
  }
  const out = new Map();
  for (const [year, list] of byYear) {
    const city = [];
    const hwy = [];
    const comb = [];
    const fuels = new Set();
    const classes = new Set();
    const ids = [];
    for (const row of list) {
      const c = num(row.city08);
      const h = num(row.highway08);
      const b = num(row.comb08);
      if (c) city.push(c);
      if (h) hwy.push(h);
      if (b) comb.push(b);
      if (row.fuelType1) fuels.add(row.fuelType1);
      if (row.VClass) classes.add(row.VClass);
      const id = Number(row.id);
      if (id) ids.push(id);
    }
    if (!comb.length || !ids.length) continue;
    ids.sort((a, b) => a - b);
    out.set(year, {
      city: [Math.min(...city), Math.max(...city)],
      hwy: [Math.min(...hwy), Math.max(...hwy)],
      comb: [Math.min(...comb), Math.max(...comb)],
      fuels: [...fuels].sort(),
      classes: [...classes].sort(),
      idMin: ids[0],
      idMax: ids[ids.length - 1],
      count: list.length,
    });
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "CarAlphaContentAudit/1.0 (vehicle facts; educational)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function cachePath(kind, key) {
  const dir = path.join(CACHE, kind);
  fs.mkdirSync(dir, { recursive: true });
  const safe = key.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 180);
  return path.join(dir, safe + ".json");
}

async function cached(kind, key, url) {
  const file = cachePath(kind, key);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = await fetchJson(url);
      fs.writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function pool(items, limit, worker) {
  const ret = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const idx = cursor++;
      ret[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return ret;
}

function trimComponent(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function nhtsaFor(entry) {
  const make = entry.makeName;
  const model = entry.name;
  const year = entry.year;
  const key = `${make}|${model}|${year}`;
  const recallUrl = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
  const ratingUrl = `https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`;
  let recalls = null;
  let ratings = null;
  try {
    const data = await cached("recalls", key, recallUrl);
    const campaigns = (data.results || []).map((row) => ({
      id: row.NHTSACampaignNumber,
      component: trimComponent(row.Component),
    })).filter((row) => row.id);
    const seen = new Set();
    const unique = [];
    for (const row of campaigns) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      unique.push(row);
    }
    recalls = { count: unique.length, campaigns: unique.slice(0, 8) };
  } catch (err) {
    recalls = null;
  }
  try {
    const data = await cached("ratings", key, ratingUrl);
    const vehicles = (data.Results || []).slice(0, 4);
    const rows = [];
    for (const vehicle of vehicles) {
      const detail = await cached(
        "rating-detail",
        String(vehicle.VehicleId),
        `https://api.nhtsa.gov/SafetyRatings/VehicleId/${vehicle.VehicleId}`
      );
      const result = (detail.Results && detail.Results[0]) || {};
      rows.push({
        id: vehicle.VehicleId,
        desc: vehicle.VehicleDescription,
        overall: result.OverallRating || "Not Rated",
        front: result.OverallFrontCrashRating || "Not Rated",
        side: result.OverallSideCrashRating || "Not Rated",
        rollover: result.RolloverRating || "Not Rated",
      });
    }
    if (rows.length) ratings = { rows };
  } catch (err) {
    ratings = null;
  }
  return { recalls, ncap: ratings };
}

function parseGenerations(wikitext) {
  const parts = String(wikitext || "").split(/\{\{Infobox automobile/i).slice(1);
  const ranges = [];
  for (const part of parts) {
    const nameMatch = part.match(/\|\s*name\s*=\s*([^\n|<]+)/);
    const yearsMatch = part.match(/\|\s*model_years\s*=\s*([^\n]+)/);
    if (!nameMatch || !yearsMatch) continue;
    const line = yearsMatch[1].replace(/<ref[\s\S]*?<\/ref>/gi, " ").replace(/\{\{[^}]+\}\}/g, " ");
    const pairs = [...line.matchAll(/((?:19|20)\d{2})\s*[–—-]\s*((?:19|20)\d{2}|present)/gi)];
    if (pairs.length !== 1) continue;
    const low = line.toLowerCase();
    const regional = /(japan|jdm|australia|europe|china|united kingdom|\buk\b|south africa)/i.test(low);
    const northAmerica = /(north america|united states|\bu\.s\.)/i.test(low);
    if (regional && !northAmerica) continue;
    const start = Number(pairs[0][1]);
    const end = /present/i.test(pairs[0][2]) ? null : Number(pairs[0][2]);
    if (end && end < start) continue;
    const name = nameMatch[1].replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[|\]\]/g, "").replace(/<[^>]+>/g, "").trim();
    if (!name || name.length > 40) continue;
    ranges.push({ name, start, end, northAmerica });
  }
  function overlaps(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const aEnd = a.end || 2030;
        const bEnd = b.end || 2030;
        if (a.start <= bEnd && b.start <= aEnd) return true;
      }
    }
    return false;
  }
  let kept = ranges;
  if (overlaps(kept)) {
    const na = kept.filter((row) => row.northAmerica);
    if (na.length && !overlaps(na)) kept = na;
    else return [];
  }
  return kept.map(({ name, start, end }) => ({ name, start, end }));
}

async function generationsFor(model) {
  const query = `${model.makeName} ${model.name}`;
  let title = null;
  try {
    const data = await cached(
      "wiki-search",
      query,
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`
    );
    title = data[1] && data[1][0];
  } catch (err) {
    return null;
  }
  if (!title) return null;
  const titleNorm = norm(title);
  const modelNorm = norm(model.name);
  if (modelNorm.length < 3 || !titleNorm.includes(modelNorm)) return null;
  let parsed;
  try {
    parsed = await cached(
      "wiki-parse",
      title,
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2`
    );
  } catch (err) {
    return null;
  }
  const wikitext = parsed && parsed.parse && parsed.parse.wikitext;
  const ranges = parseGenerations(wikitext);
  if (!ranges.length) return null;
  return {
    source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%20/g, "_")}`,
    retrieved: RETRIEVED,
    ranges,
  };
}

function generationForYear(modelGen, year) {
  if (!modelGen) return null;
  const match = modelGen.ranges.find((range) => year >= range.start && (range.end == null || year <= range.end));
  if (!match) return null;
  return {
    name: match.name,
    start: match.start,
    end: match.end,
    index: year - match.start + 1,
    source: modelGen.source,
    retrieved: modelGen.retrieved,
  };
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "models.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "modelYears.json"), "utf8"));
  console.log("loading EPA csv");
  const epaRows = loadEpaRows();
  const byMake = indexEpa(epaRows);
  const epaByModel = new Map();
  let epaModels = 0;
  for (const model of models) {
    const summary = summarizeEpa(rowsForModel(model, byMake));
    epaByModel.set(`${model.makeSlug}/${model.slug}`, summary);
    if (summary.size) epaModels++;
  }
  console.log(`EPA matched ${epaModels} of ${models.length} models`);

  console.log("fetching NHTSA for", modelYears.length, "model years");
  let done = 0;
  const nhtsa = await pool(modelYears, CONCURRENCY, async (entry) => {
    const result = await nhtsaFor(entry);
    done++;
    if (done % 200 === 0) console.log(`  nhtsa ${done}/${modelYears.length}`);
    return result;
  });

  console.log("fetching Wikipedia generations");
  const gens = await pool(models, 4, async (model) => generationsFor(model));
  const genByModel = new Map();
  models.forEach((model, idx) => {
    if (gens[idx]) genByModel.set(`${model.makeSlug}/${model.slug}`, gens[idx]);
  });
  console.log(`Wikipedia generations kept for ${genByModel.size} models`);

  const years = {};
  modelYears.forEach((entry, idx) => {
    const key = `${entry.makeSlug}/${entry.slug}`;
    const epa = epaByModel.get(key) && epaByModel.get(key).get(entry.year);
    const fetched = nhtsa[idx] || {};
    const generation = generationForYear(genByModel.get(key), entry.year);
    const recalls = fetched.recalls;
    const ncap = fetched.ncap;
    const recallHit = recalls && recalls.count > 0;
    if (!epa && !recallHit && !ncap && !generation) return;
    const record = {};
    if (epa) record.epa = epa;
    if (recalls && (recallHit || epa || ncap)) record.recalls = recalls;
    if (ncap) record.ncap = ncap;
    if (generation) record.generation = generation;
    years[`${key}/${entry.year}`] = record;
  });

  const indexableModels = {};
  for (const key of Object.keys(years)) {
    const modelKey = key.split("/").slice(0, 2).join("/");
    indexableModels[modelKey] = (indexableModels[modelKey] || 0) + 1;
  }

  const payload = {
    built: RETRIEVED,
    sources: {
      epa: EPA_URL,
      recalls: "https://api.nhtsa.gov/recalls/recallsByVehicle",
      ncap: "https://api.nhtsa.gov/SafetyRatings",
      generations: "Wikipedia infobox model_years, non-overlapping ranges only",
    },
    yearCount: Object.keys(years).length,
    modelCount: Object.keys(indexableModels).length,
    years,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(`wrote ${OUT} years=${payload.yearCount} models=${payload.modelCount} bytes=${fs.statSync(OUT).size}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  norm,
  loadEpaRows,
  indexEpa,
  rowsForModel,
  num,
};
