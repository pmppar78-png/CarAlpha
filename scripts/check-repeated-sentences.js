#!/usr/bin/env node
"use strict";

/**
 * Fails when make/model/year copy repeats a sentence across pages after the
 * page's own make, model, and year are masked. Also fails thin hub pages and
 * a short list of boilerplate phrases that the audit called out.
 */

const fs = require("fs");
const path = require("path");
const { iterPages, load } = require("../lib/vehicle-copy");

const MIN_WORDS = 8;
const ROOT = path.join(__dirname, "..");

function words(text) {
  return String(text).trim().split(/\s+/).filter(Boolean);
}

function sentencesOf(text) {
  return String(text)
    .split(/(?<=[.?!])\s+/)
    .map(function (s) { return s.replace(/\s+/g, " ").trim(); })
    .filter(function (s) { return words(s).length >= MIN_WORDS; });
}

function maskName(sentence, name) {
  if (!name) return sentence;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = name.length >= 4 ? "gi" : "g";
  return sentence.replace(new RegExp("\\b" + escaped + "\\b", flags), "{name}");
}

function normalize(sentence, page) {
  let s = sentence;
  s = maskName(s, page.make);
  s = maskName(s, page.model);
  if (page.year) {
    s = s.replace(new RegExp("\\b" + page.year + "\\b", "g"), "{year}");
  }
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function checkGenerator() {
  const seen = new Map();
  const pages = iterPages();
  for (const page of pages) {
    const local = new Set();
    for (const sentence of sentencesOf(page.plain)) {
      const key = normalize(sentence, page);
      if (local.has(key)) continue;
      local.add(key);
      if (!seen.has(key)) seen.set(key, []);
      const list = seen.get(key);
      if (list.length < 5) list.push(page.id);
    }
  }
  const dupes = [];
  for (const [key, ids] of seen) {
    if (ids.length >= 2) dupes.push({ key, ids, count: ids.length });
  }
  dupes.sort(function (a, b) { return b.count - a.count; });
  return { pages: pages.length, dupes };
}

function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVehicleCopy(html) {
  const chunks = [];
  const re = /<([a-z0-9]+)\b([^>]*\bdata-vehicle-copy\b[^>]*)>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[1].toLowerCase();
    const start = match.index + match[0].length;
    if (tag === "p") {
      const end = html.toLowerCase().indexOf("</p>", start);
      chunks.push(end === -1 ? html.slice(start) : html.slice(start, end));
      continue;
    }
    const token = new RegExp("<" + tag + "\\b|</" + tag + ">", "gi");
    token.lastIndex = start;
    let depth = 1;
    let innerEnd = html.length;
    let nested;
    while ((nested = token.exec(html))) {
      if (nested[0].startsWith("</")) depth -= 1;
      else depth += 1;
      if (depth === 0) {
        innerEnd = nested.index;
        break;
      }
    }
    chunks.push(html.slice(start, innerEnd));
    re.lastIndex = innerEnd;
  }
  return chunks.join(" ");
}

function checkBuiltHtml() {
  const site = path.join(ROOT, "_site", "makes");
  if (!fs.existsSync(site)) return { skipped: true, dupes: [] };
  const data = load();
  const seen = new Map();
  let files = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const html = fs.readFileSync(full, "utf8");
        if (!html.includes("data-vehicle-copy")) continue;
        files += 1;
        const text = stripTags(extractVehicleCopy(html));
        const id = full.replace(path.join(ROOT, "_site"), "");
        const local = new Set();
        const page = pageFromPath(id, data);
        for (const sentence of sentencesOf(text)) {
          const key = normalize(sentence, page);
          if (local.has(key)) continue;
          local.add(key);
          if (!seen.has(key)) seen.set(key, []);
          const list = seen.get(key);
          if (list.length < 5) list.push(id);
        }
      }
    }
  }
  walk(site);
  const dupes = [];
  for (const [key, ids] of seen) {
    if (ids.length >= 2) dupes.push({ key, ids, count: ids.length });
  }
  dupes.sort(function (a, b) { return b.count - a.count; });
  return { skipped: false, files, dupes };
}

function pageFromPath(id, data) {
  const parts = id.split("/").filter(Boolean);
  const make = data.makeBySlug.get(parts[1]);
  const model = data.modelByKey.get(parts[1] + "/" + parts[2]);
  const year = /^\d{4}$/.test(parts[3] || "") ? parts[3] : null;
  return {
    make: make ? make.name : "",
    model: model ? model.name : "",
    year: year,
  };
}

function hubWords() {
  const hubs = [
    "src/guides/safety/index.njk",
    "src/guides/buying/index.njk",
    "src/guides/repairs/index.njk",
    "src/guides/financing/index.njk",
    "src/guides/warranties/index.njk",
    "src/guides/ev/index.njk",
    "src/guides/insurance/index.njk",
  ];
  const thin = [];
  const counts = {};
  for (const rel of hubs) {
    const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const body = raw.replace(/^---[\s\S]*?---/, " ");
    const text = stripTags(body);
    const count = words(text).length;
    counts[rel] = count;
    if (count < 800) thin.push({ rel, count });
  }
  return { counts, thin };
}

function bannedPhrases() {
  const needles = [
    "beat dealer trade-in",
    "10–20%",
    "10-20%",
    "Coverage typically includes powertrain",
    "Have an independent mechanic perform a pre-purchase inspection",
    "Common recall categories include airbag systems",
  ];
  const roots = [
    path.join(ROOT, "src", "makes"),
    path.join(ROOT, "src", "_includes", "partials", "ai-modal.njk"),
  ];
  const hits = [];
  function scan(file) {
    const text = fs.readFileSync(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) hits.push({ file: path.relative(ROOT, file), needle });
    }
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(njk|js|md)$/.test(entry.name)) scan(full);
    }
  }
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stat = fs.statSync(root);
    if (stat.isDirectory()) walk(root);
    else scan(root);
  }
  return hits;
}

function main() {
  const errors = [];
  const generated = checkGenerator();
  if (generated.dupes.length) {
    errors.push(
      generated.dupes.length + " repeated sentence(s) across " + generated.pages + " generated pages. First: " +
      JSON.stringify(generated.dupes[0])
    );
  } else {
    console.log("generator: " + generated.pages + " pages, no repeated sentence of " + MIN_WORDS + "+ words");
  }

  const built = checkBuiltHtml();
  if (built.skipped) {
    console.log("built HTML: _site/makes not present, skipped");
  } else if (built.dupes.length) {
    errors.push(
      built.dupes.length + " repeated sentence(s) in built [data-vehicle-copy]. First: " +
      JSON.stringify(built.dupes[0])
    );
  } else {
    console.log("built HTML: " + built.files + " pages with vehicle copy, no repeated sentence");
  }

  const hubs = hubWords();
  for (const [rel, count] of Object.entries(hubs.counts)) {
    console.log("hub " + rel + ": " + count + " words");
  }
  for (const thin of hubs.thin) {
    errors.push(thin.rel + " is " + thin.count + " words; hubs must be at least 800");
  }

  const banned = bannedPhrases();
  for (const hit of banned) {
    errors.push(hit.file + " still contains " + JSON.stringify(hit.needle));
  }
  if (!banned.length) console.log("banned phrases: none in makes templates or ai-modal");

  if (errors.length) {
    console.error("\nBoilerplate check failed:");
    for (const err of errors) console.error(" - " + err);
    process.exit(1);
  }
  console.log("boilerplate check passed");
}

main();
