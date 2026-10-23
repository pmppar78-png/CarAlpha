#!/usr/bin/env node
"use strict";

/**
 * Dated snapshot of EPA fuel economy and NHTSA recall, complaint, and
 * safety-rating counts. Missing responses are omitted. Numbers are not invented.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const SNAPSHOT = "2026-10-23";
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "_data", "vehicleFacts.json");
const CACHE = "/tmp/caralpha-facts-cache";
const UA = "CarAlphaSnapshot/1.0 (educational; +https://caralpha.org)";
const CONCURRENCY = 12;

fs.mkdirSync(CACHE, { recursive: true });

function cachePath(url) {
  return path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex"));
}

function get(url, opts) {
  const limit = opts && opts.limit;
  const cached = cachePath(url + (limit ? ":partial" : ""));
  if (fs.existsSync(cached)) {
    const raw = fs.readFileSync(cached, "utf8");
    if (raw.startsWith("ERR:")) return Promise.resolve(null);
    try { return Promise.resolve(JSON.parse(raw)); } catch (_e) { return Promise.resolve(raw); }
  }
  return new Promise(function (resolve) {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, function (res) {
      const chunks = [];
      let size = 0;
      res.on("data", function (chunk) {
        size += chunk.length;
        chunks.push(chunk);
        if (limit && size >= limit) res.destroy();
      });
      res.on("end", finish);
      res.on("close", finish);
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode && res.statusCode >= 400) {
          fs.writeFileSync(cached, "ERR:" + res.statusCode);
          resolve(null);
          return;
        }
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
        fs.writeFileSync(cached, typeof parsed === "string" ? parsed : JSON.stringify(parsed));
        resolve(parsed);
      }
    });
    req.on("error", function () {
      resolve(null);
    });
    req.setTimeout(25000, function () { req.destroy(); });
  });
}

function countFrom(payload) {
  if (!payload) return null;
  if (typeof payload === "object") {
    if (payload.Count != null) return Number(payload.Count);
    if (payload.count != null) return Number(payload.count);
    if (Array.isArray(payload.results)) return payload.results.length;
    if (Array.isArray(payload.Results)) return payload.Results.length;
  }
  const text = String(payload);
  const match = text.match(/"(?:Count|count)"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function menuItems(payload) {
  if (!payload || !payload.menuItem) return [];
  const items = Array.isArray(payload.menuItem) ? payload.menuItem : [payload.menuItem];
  return items.map(function (item) { return { text: item.text, value: item.value }; }).filter(function (item) { return item.text; });
}

function matchesModel(epaName, modelName, longerNames) {
  const epa = epaName.toLowerCase();
  const name = modelName.toLowerCase();
  if (epa !== name && epa.indexOf(name + " ") !== 0 && epa.indexOf(name) !== 0) return false;
  for (const other of longerNames) {
    if (other.toLowerCase() === name) continue;
    if (other.length > modelName.length && epa.indexOf(other.toLowerCase()) === 0) return false;
  }
  return epa === name || epa.indexOf(name) === 0;
}

async function pool(items, limit, worker) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  }
  const runners = [];
  for (let i = 0; i < limit; i++) runners.push(run());
  await Promise.all(runners);
}

async function main() {
  const modelYears = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "modelYears.json"), "utf8"));
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "_data", "models.json"), "utf8"));
  const byMake = new Map();
  for (const model of models) {
    if (!byMake.has(model.makeName)) byMake.set(model.makeName, []);
    byMake.get(model.makeName).push(model.name);
  }

  const menuCache = new Map();
  async function epaModels(year, make) {
    const key = year + "|" + make;
    if (menuCache.has(key)) return menuCache.get(key);
    const url = "https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=" + year + "&make=" + encodeURIComponent(make);
    const payload = await get(url);
    const items = menuItems(payload);
    menuCache.set(key, items);
    return items;
  }

  const vehicles = {};
  let done = 0;
  const started = Date.now();

  await pool(modelYears, CONCURRENCY, async function (row) {
    const key = row.makeSlug + "/" + row.slug + "/" + row.year;
    const fact = {};
    const makeQ = encodeURIComponent(row.makeName.toLowerCase());
    const modelQ = encodeURIComponent(row.name.toLowerCase());
    const recallsUrl = "https://api.nhtsa.gov/recalls/recallsByVehicle?make=" + makeQ + "&model=" + modelQ + "&modelYear=" + row.year;
    const complaintsUrl = "https://api.nhtsa.gov/complaints/complaintsByVehicle?make=" + makeQ + "&model=" + modelQ + "&modelYear=" + row.year;
    const ratingsUrl = "https://api.nhtsa.gov/SafetyRatings/modelyear/" + row.year + "/make/" + makeQ + "/model/" + modelQ;

    const recalls = await get(recallsUrl);
    const recallCount = countFrom(recalls);
    if (recallCount != null) fact.recalls = recallCount;

    const complaints = await get(complaintsUrl, { limit: 280 });
    const complaintCount = countFrom(complaints);
    if (complaintCount != null) fact.complaints = complaintCount;

    const ratings = await get(ratingsUrl);
    const variants = ratings && Array.isArray(ratings.Results) ? ratings.Results.slice(0, 2) : [];
    const stars = [];
    for (const variant of variants) {
      if (!variant.VehicleId) continue;
      const detail = await get("https://api.nhtsa.gov/SafetyRatings/VehicleId/" + variant.VehicleId);
      const row0 = detail && detail.Results && detail.Results[0];
      const overall = row0 && parseInt(row0.OverallRating, 10);
      if (overall) stars.push(overall);
    }
    if (stars.length) {
      fact.starsMin = Math.min.apply(null, stars);
      fact.starsMax = Math.max.apply(null, stars);
    }

    try {
      const menu = await epaModels(row.year, row.makeName);
      const longer = byMake.get(row.makeName) || [];
      const hits = menu.filter(function (item) { return matchesModel(item.text, row.name, longer); }).slice(0, 3);
      const mpgs = [];
      let sample = null;
      for (const hit of hits) {
        const optionsUrl = "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=" + row.year +
          "&make=" + encodeURIComponent(row.makeName) + "&model=" + encodeURIComponent(hit.value);
        const options = menuItems(await get(optionsUrl)).slice(0, 1);
        for (const option of options) {
          const vehicle = await get("https://www.fueleconomy.gov/ws/rest/vehicle/" + option.value);
          if (!vehicle || vehicle.comb08 == null) continue;
          mpgs.push({
            city: Number(vehicle.city08),
            hwy: Number(vehicle.highway08),
            comb: Number(vehicle.comb08),
          });
          if (!sample) {
            sample = {
              displ: vehicle.displ || null,
              cylinders: vehicle.cylinders ? Number(vehicle.cylinders) : null,
              drive: vehicle.drive || null,
              trans: vehicle.trany || null,
            };
          }
        }
      }
      if (mpgs.length) {
        fact.cityMin = Math.min.apply(null, mpgs.map(function (m) { return m.city; }));
        fact.cityMax = Math.max.apply(null, mpgs.map(function (m) { return m.city; }));
        fact.hwyMin = Math.min.apply(null, mpgs.map(function (m) { return m.hwy; }));
        fact.hwyMax = Math.max.apply(null, mpgs.map(function (m) { return m.hwy; }));
        fact.combMin = Math.min.apply(null, mpgs.map(function (m) { return m.comb; }));
        fact.combMax = Math.max.apply(null, mpgs.map(function (m) { return m.comb; }));
        fact.epaTrims = mpgs.length;
        if (sample && sample.displ) fact.displ = sample.displ;
        if (sample && sample.cylinders) fact.cylinders = sample.cylinders;
        if (sample && sample.drive) fact.drive = sample.drive;
        if (sample && sample.trans) fact.trans = sample.trans;
      }
    } catch (_err) { /* omit EPA */ }

    if (Object.keys(fact).length) vehicles[key] = fact;
    done += 1;
    if (done % 25 === 0 || done === modelYears.length) {
      const elapsed = Math.round((Date.now() - started) / 1000);
      fs.writeFileSync(OUT, JSON.stringify({ snapshotDate: SNAPSHOT, vehicles: vehicles }));
      console.log(done + "/" + modelYears.length + " in " + elapsed + "s, saved " + Object.keys(vehicles).length);
    }
  });

  fs.writeFileSync(OUT, JSON.stringify({ snapshotDate: SNAPSHOT, vehicles: vehicles }));
  console.log("done", Object.keys(vehicles).length);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
