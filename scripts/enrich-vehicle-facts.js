#!/usr/bin/env node
"use strict";

/**
 * Adds recorded EPA configuration rows, NHTSA recall summary/consequence/remedy,
 * and complaint-component counts onto src/_data/vehicleFacts.json.
 * Does not rebuild the file, so the vehicles dictionary and snapshot date stay.
 */

const fs = require("fs");
const path = require("path");
const { loadEpaRows, indexEpa, rowsForModel, num } = require("./build-vehicle-facts");
const { campaignKind } = require("../lib/vehicle-copy");
const { plainRecallLabel } = require("../lib/recall-labels");
const { fixArticles } = require("../lib/article");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "_data", "vehicleFacts.json");
const CACHE = "/tmp/vehicle-facts-cache";
const CONCURRENCY = 8;

function cacheFile(kind, make, model, year) {
  const key = `${make}|${model}|${year}`;
  const safe = key.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 180);
  return path.join(CACHE, kind, safe + ".json");
}

const KEEP_CAPS = ["NHTSA", "NCAP", "EPA", "ABS", "ECU", "VIN", "SUV", "MPV", "TPMS", "ESC", "OBD", "IIHS"];

function readableRecord(text) {
  let raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  raw = raw.replace(/([A-Za-z]);([A-Za-z])/g, "$1'$2");
  const letters = raw.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 40 && upper / letters.length > 0.8) {
    raw = raw.toLowerCase().replace(/(^|[.?!]\s+)([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());
    for (const word of KEEP_CAPS) {
      raw = raw.replace(new RegExp("\\b" + word.toLowerCase() + "\\b", "g"), word);
    }
  }
  const pieces = raw.split(/(?<=[.?!])\s+/);
  const normalized = [];
  for (const piece of pieces) {
    const semis = (piece.match(/;/g) || []).length;
    if (semis >= 4) {
      piece.split(/\s*;\s*/).forEach((bit) => normalized.push(bit));
    } else {
      normalized.push(piece);
    }
  }
  const kept = [];
  for (const part of normalized) {
    const bit = part.replace(/\s+/g, " ").trim();
    if (!bit || kept.length >= 2) continue;
    kept.push(/[.?!]$/.test(bit) ? bit : `${bit}.`);
  }
  return fixArticles(kept.join(" "));
}

function clipRecord(text) {
  return readableRecord(text);
}

function engineLabel(row) {
  const displ = num(row.displ);
  const cyl = num(row.cylinders);
  if (displ || cyl) {
    const bits = [];
    if (displ) bits.push(`${displ}L`);
    if (cyl) bits.push(`${cyl}-cyl`);
    return bits.join(" ");
  }
  const motor = String(row.evMotor || "").replace(/\s+/g, " ").trim();
  if (motor && !/^tbd$/i.test(motor)) return motor.slice(0, 80);
  if (row.fuelType1 === "Electricity") return "Electric motor";
  return "Engine not listed";
}

function mpg(row, gasKey) {
  return num(row[gasKey]);
}

function co2Value(row) {
  const n = Number(row.co2TailpipeGpm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

const PRICE_KEY = {
  "Regular Gasoline": "regular",
  "Premium Gasoline": "premium",
  "Midgrade Gasoline": "midgrade",
  "Diesel": "diesel",
};

const FUEL_COST_AS_OF = "October 23, 2026";

function annualCost(mpgValue, price) {
  const rate = Number(price);
  if (!mpgValue || !rate) return null;
  const raw = rate * (15000 / mpgValue);
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw / 50) * 50;
}

async function fuelPrices() {
  const res = await fetch("https://www.fueleconomy.gov/ws/rest/fuelprices", {
    headers: { Accept: "application/json", "User-Agent": "CarAlphaContentAudit/1.0" },
  });
  if (!res.ok) throw new Error("fuel prices " + res.status);
  return res.json();
}

function configRows(list, prices) {
  const seen = new Set();
  const configs = [];
  for (const row of list) {
    const city = mpg(row, "city08");
    const hwy = mpg(row, "highway08");
    const comb = mpg(row, "comb08");
    if (!city && !hwy && !comb) continue;
    const fuel = String(row.fuelType1 || "").replace(/\s+/g, " ").trim() || "—";
    const priceKey = PRICE_KEY[fuel];
    const plugIn = /plug/i.test(String(row.atvType || "")) || /electric/i.test(String(row.fuelType2 || ""));
    const priced = !plugIn && priceKey && prices ? annualCost(comb, prices[priceKey]) : null;
    const item = {
      name: String(row.model || "").replace(/\s+/g, " ").trim() || "—",
      engine: engineLabel(row),
      trans: String(row.trany || "").replace(/\s+/g, " ").trim() || "—",
      drive: String(row.drive || "").replace(/\s+/g, " ").trim() || "—",
      city: city || "—",
      hwy: hwy || "—",
      comb: comb || "—",
      fuel,
      fuelCost: priced || num(row.fuelCost08),
      fuelCostSource: priced ? "fueleconomy.gov fuelprices" : "vehicles.csv",
      co2: co2Value(row),
    };
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    configs.push(item);
  }
  configs.sort((a, b) => {
    const ac = typeof a.comb === "number" ? a.comb : -1;
    const bc = typeof b.comb === "number" ? b.comb : -1;
    if (bc !== ac) return bc - ac;
    return String(a.engine).localeCompare(String(b.engine));
  });
  return configs;
}

function recallFromCache(make, model, year) {
  const file = cacheFile("recalls", make, model, year);
  if (!fs.existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return null;
  }
  const seen = new Set();
  const campaigns = [];
  for (const row of data.results || []) {
    const id = row.NHTSACampaignNumber;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const component = String(row.Component || "").replace(/\s+/g, " ").trim();
    const summary = clipRecord(row.Summary);
    campaigns.push({
      id,
      component: component.slice(0, 160),
      label: plainRecallLabel(component, summary),
      kind: campaignKind(id),
      summary,
      consequence: clipRecord(row.Consequence),
      remedy: clipRecord(row.Remedy),
    });
  }
  if (!campaigns.length) return { count: 0, campaigns: [] };
  return { count: campaigns.length, campaigns };
}

function complaintTop(results) {
  const counts = new Map();
  for (const row of results || []) {
    const raw = String(row.components || "");
    for (const part of raw.split(",")) {
      const name = part.trim().toLowerCase().replace(/\s+/g, " ");
      if (!name || name === "unknown or other") continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "CarAlphaContentAudit/1.0 (vehicle facts; educational)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function complaintsFor(make, model, year) {
  const file = cacheFile("complaints", make, model, year);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      fs.unlinkSync(file);
    }
  }
  const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = await fetchJson(url);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function pool(items, limit, worker) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

function numericSpan(values) {
  const nums = values.filter((value) => typeof value === "number");
  if (!nums.length) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

const VEHICLE_EPA_FIELDS = [
  "cityMin", "cityMax", "hwyMin", "hwyMax", "combMin", "combMax",
  "epaConfigs", "epaLow", "epaHigh", "epaName", "displ", "cylinders", "drive", "trans", "epaTrims",
];

function clearVehicleEpa(vehicle) {
  if (!vehicle) return;
  for (const field of VEHICLE_EPA_FIELDS) delete vehicle[field];
}

function syncVehicleEpa(vehicle, configs, rows) {
  if (!vehicle) return;
  clearVehicleEpa(vehicle);
  const comb = numericSpan(configs.map((row) => row.comb));
  const city = numericSpan(configs.map((row) => row.city));
  const hwy = numericSpan(configs.map((row) => row.hwy));
  if (comb) {
    vehicle.combMin = comb[0];
    vehicle.combMax = comb[1];
  }
  if (city) {
    vehicle.cityMin = city[0];
    vehicle.cityMax = city[1];
  }
  if (hwy) {
    vehicle.hwyMin = hwy[0];
    vehicle.hwyMax = hwy[1];
  }
  vehicle.epaConfigs = configs.length;
  if (configs.length === 1) {
    vehicle.epaName = configs[0].name;
    const source = rows[0] || {};
    const displ = num(source.displ);
    const cylinders = num(source.cylinders);
    if (displ) vehicle.displ = displ;
    if (cylinders) vehicle.cylinders = cylinders;
    if (source.drive) vehicle.drive = String(source.drive).replace(/\s+/g, " ").trim();
    if (source.trany) vehicle.trans = String(source.trany).replace(/\s+/g, " ").trim();
    return;
  }
  const low = configs.reduce((a, b) => (Number(a.comb) <= Number(b.comb) ? a : b));
  const high = configs.reduce((a, b) => (Number(a.comb) >= Number(b.comb) ? a : b));
  vehicle.epaLow = low.name;
  vehicle.epaHigh = high.name;
}

function mainEpaAndRecalls(facts, models, prices) {
  const rows = loadEpaRows();
  const byMake = indexEpa(rows);
  const byKey = new Map();
  const modelByKey = new Map();
  for (const model of models) {
    modelByKey.set(`${model.makeSlug}/${model.slug}`, model);
    const matched = rowsForModel(model, byMake);
    const byYear = new Map();
    for (const row of matched) {
      const year = Number(row.year);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(row);
    }
    byKey.set(`${model.makeSlug}/${model.slug}`, byYear);
  }

  let configs = 0;
  let recallText = 0;
  let cleared = 0;
  for (const [key, rec] of Object.entries(facts.years)) {
    const parts = key.split("/");
    const year = Number(parts[2]);
    const modelKey = `${parts[0]}/${parts[1]}`;
    const model = modelByKey.get(modelKey);
    const vehicle = facts.vehicles && facts.vehicles[key];
    if (model) {
      const list = (byKey.get(modelKey) && byKey.get(modelKey).get(year)) || [];
      const table = configRows(list, prices);
      if (table.length) {
        if (!rec.epa) rec.epa = {};
        const comb = numericSpan(table.map((row) => row.comb));
        const city = numericSpan(table.map((row) => row.city));
        const hwy = numericSpan(table.map((row) => row.hwy));
        const fuels = [...new Set(table.map((row) => row.fuel).filter((fuel) => fuel && fuel !== "—"))].sort();
        const classes = [...new Set(list.map((row) => String(row.VClass || "").trim()).filter(Boolean))].sort();
        rec.epa.configs = table;
        rec.epa.count = table.length;
        rec.epa.fuelCostAsOf = FUEL_COST_AS_OF;
        if (prices) {
          rec.epa.fuelPrices = {
            regular: Number(prices.regular),
            midgrade: Number(prices.midgrade),
            premium: Number(prices.premium),
            diesel: Number(prices.diesel),
          };
        }
        if (comb) rec.epa.comb = comb;
        if (city) rec.epa.city = city;
        if (hwy) rec.epa.hwy = hwy;
        if (fuels.length) rec.epa.fuels = fuels;
        if (classes.length) rec.epa.classes = classes;
        syncVehicleEpa(vehicle, table, list);
        configs += 1;
      } else if (!list.length && vehicle && vehicle.epaConfigs) {
        clearVehicleEpa(vehicle);
        cleared += 1;
      }
    }
    if (model && rec.recalls && rec.recalls.count > 0) {
      const full = recallFromCache(model.makeName, model.name, year);
      if (full && full.campaigns.length) {
        rec.recalls = full;
        recallText += 1;
      }
    }
  }
  for (const [key, vehicle] of Object.entries(facts.vehicles || {})) {
    if (!vehicle || (vehicle.epaConfigs == null && vehicle.combMin == null)) continue;
    const yearRec = facts.years[key];
    if (yearRec && yearRec.epa && yearRec.epa.configs && yearRec.epa.configs.length) continue;
    const parts = key.split("/");
    const year = Number(parts[2]);
    const model = modelByKey.get(`${parts[0]}/${parts[1]}`);
    if (!model || !year) continue;
    const list = (byKey.get(`${parts[0]}/${parts[1]}`) && byKey.get(`${parts[0]}/${parts[1]}`).get(year)) || [];
    const table = configRows(list, prices);
    if (table.length) syncVehicleEpa(vehicle, table, list);
    else {
      clearVehicleEpa(vehicle);
      cleared += 1;
    }
  }
  console.log(`epa config tables ${configs}, stale vehicle ranges cleared ${cleared}, recall writeups ${recallText}`);
}

async function mainComplaints(facts, models) {
  const modelByKey = new Map(models.map((model) => [`${model.makeSlug}/${model.slug}`, model]));
  const jobs = [];
  for (const key of Object.keys(facts.years)) {
    const vehicle = facts.vehicles && facts.vehicles[key];
    if (!vehicle || !(Number(vehicle.complaints) > 0)) continue;
    const parts = key.split("/");
    const model = modelByKey.get(`${parts[0]}/${parts[1]}`);
    if (!model) continue;
    jobs.push({ key, model, year: Number(parts[2]) });
  }
  let done = 0;
  let failed = 0;
  await pool(jobs, CONCURRENCY, async (job) => {
    try {
      const data = await complaintsFor(job.model.makeName, job.model.name, job.year);
      const results = data.results || [];
      const count = Number.isFinite(Number(data.count)) ? Number(data.count) : results.length;
      const top = complaintTop(results);
      if (count > 0) {
        facts.years[job.key].complaints = { count, top };
        if (facts.vehicles[job.key]) facts.vehicles[job.key].complaints = count;
      }
    } catch (err) {
      failed += 1;
      if (failed <= 8) console.error("complaint miss", job.key, err.message);
    }
    done += 1;
    if (done % 200 === 0) console.log(`complaints ${done}/${jobs.length} failed ${failed}`);
  });
  console.log(`complaints done ${done} failed ${failed}`);
}

async function main() {
  const facts = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "models.json"), "utf8"));
  if (!facts.vehicles || !facts.snapshotDate) {
    throw new Error("vehicleFacts.json is missing vehicles or snapshotDate; refusing to rewrite");
  }
  const prices = await fuelPrices();
  console.log("fuel prices", prices.regular, prices.premium, prices.midgrade, prices.diesel);
  mainEpaAndRecalls(facts, models, prices);
  await mainComplaints(facts, models);
  facts.sources = Object.assign({}, facts.sources, {
    complaints: "https://api.nhtsa.gov/complaints/complaintsByVehicle",
  });
  fs.writeFileSync(OUT, JSON.stringify(facts));
  console.log(`wrote ${OUT} bytes=${fs.statSync(OUT).size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
