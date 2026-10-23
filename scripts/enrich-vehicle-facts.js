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
const { componentPhrase, campaignKind } = require("../lib/vehicle-copy");
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

function configRows(list) {
  const seen = new Set();
  const configs = [];
  for (const row of list) {
    const city = mpg(row, "city08");
    const hwy = mpg(row, "highway08");
    const comb = mpg(row, "comb08");
    if (!city && !hwy && !comb) continue;
    const item = {
      engine: engineLabel(row),
      trans: String(row.trany || "").replace(/\s+/g, " ").trim() || "—",
      drive: String(row.drive || "").replace(/\s+/g, " ").trim() || "—",
      city: city || "—",
      hwy: hwy || "—",
      comb: comb || "—",
      fuel: String(row.fuelType1 || "").replace(/\s+/g, " ").trim() || "—",
      fuelCost: num(row.fuelCost08),
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
    campaigns.push({
      id,
      component: component.slice(0, 160),
      label: componentPhrase(component),
      kind: campaignKind(id),
      summary: clipRecord(row.Summary),
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

function mainEpaAndRecalls(facts, models) {
  const rows = loadEpaRows();
  const byMake = indexEpa(rows);
  const byKey = new Map();
  for (const model of models) {
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
  for (const [key, rec] of Object.entries(facts.years)) {
    const parts = key.split("/");
    const year = Number(parts[2]);
    const modelKey = `${parts[0]}/${parts[1]}`;
    const model = models.find((item) => `${item.makeSlug}/${item.slug}` === modelKey);
    if (rec.epa && model) {
      const list = (byKey.get(modelKey) && byKey.get(modelKey).get(year)) || [];
      const table = configRows(list);
      if (table.length) {
        rec.epa.configs = table;
        configs += 1;
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
  console.log(`epa config tables ${configs}, recall writeups ${recallText}`);
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
  mainEpaAndRecalls(facts, models);
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
