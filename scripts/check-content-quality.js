#!/usr/bin/env node
"use strict";

/**
 * Content checks for the strict re-audit:
 * indefinite articles, FAQ JSON-LD that matches the visible answer,
 * name stuffing, national figures placed in a state, and the electric
 * emissions exemption.
 *
 * The same statute, fee, inspection rule, and lemon process is the
 * published state text, so it is the same on every page in that state.
 * Counting those shared sentences as failures produced three rounds of
 * uniqueness padding. Shared structure is not a failure.
 *
 * Failures that are padding: the phrase "next to a file of", and any
 * sentence that contains four or more semicolons.
 */

const fs = require("fs");
const path = require("path");
const { articleFor } = require("../lib/article");
const { iterPages } = require("../lib/vehicle-copy");
const { faqMismatches } = require("../lib/faq-jsonld");
const geo = require("../lib/geo-copy");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "src", "_data");
const MIN_WORDS = 8;

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
}

function words(text) {
  return String(text).trim().split(/\s+/).filter(Boolean);
}

function allSentences(text) {
  const protectedText = String(text).replace(/\b((?:[A-Z][a-z]{0,3}|[A-Z]{1,4}|tit|ch|sec))\.\s+/g, "$1.\u2060 ");
  return protectedText
    .split(/(?<=[.?!])\s+/)
    .map(function (s) { return s.replace(/\u2060/g, "").replace(/\s+/g, " ").trim(); })
    .filter(Boolean);
}

function sentencesOf(text) {
  return allSentences(text).filter(function (s) { return words(s).length >= MIN_WORDS; });
}

function semicolonHits(text, where) {
  const hits = [];
  allSentences(text).forEach(function (sentence) {
    const count = (sentence.match(/;/g) || []).length;
    if (count >= 4) hits.push(where + " has " + count + " semicolons in one sentence: " + sentence.slice(0, 180));
  });
  return hits;
}

function exactKey(sentence) {
  return String(sentence).toLowerCase().replace(/\s+/g, " ").trim();
}

const PADDING = [
  /is the state figure, not a quote/,
  /keyed to the delivery date/,
  /file the years on file/,
  /\bcatalog year\b/i,
  /\bmodel \d+ of \d+\b/i,
  /plate Included/,
  /Massachusetts's/,
  /Arkansas's/,
  /Illinois's/,
  /Kansas's/,
  /next to a file of/i,
  /the citation is shown above/i,
  /see the fee figures above/i,
  /the state citation beside/i,
];

function firstClause(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "The catalog file has no separate description";
  const cut = raw.split(/[.?!]/)[0].trim();
  return cut || raw;
}

function articleErrors(text, where) {
  const errors = [];
  const re = /\b(an?)(\s+)([A-Za-z0-9][A-Za-z0-9.'’-]+)/gi;
  let match;
  while ((match = re.exec(text))) {
    const correct = articleFor(match[3]);
    if (match[1].toLowerCase() !== correct) {
      errors.push(where + ': "' + match[1] + " " + match[3] + '" should be "' + correct + " " + match[3] + '"');
      if (errors.length >= 8) break;
    }
  }
  return errors;
}

function bundle(input) {
  const yearList = input.modelSlug ? (input.yearsByModel[input.makeSlug + "/" + input.modelSlug] || []) : [];
  const yearIndex = input.year ? yearList.indexOf(input.year) : -1;
  const makeModels = input.modelsByMake[input.makeSlug] || [];
  const modelOrdinal = input.modelSlug ? makeModels.indexOf(input.modelSlug) + 1 : 0;
  const factKey = input.modelSlug && input.year ? input.makeSlug + "/" + input.modelSlug + "/" + input.year : "";
  return {
    clause: firstClause((input.model && input.model.description) || input.make.description),
    stateName: input.state.name,
    minimum: input.state.insuranceMinimum,
    avgCost: input.state.averageInsuranceCost,
    minimumDetail: input.state.insuranceMinimumDetail,
    registrationFee: input.state.registrationFeeRange,
    registrationNotes: input.state.registrationNotes,
    evRegistration: input.state.evRegistrationDetails,
    evFeeReplaces: input.state.evFeeReplaces,
    titleFee: input.state.titleFee,
    plateFee: input.state.plateFee,
    hasEmissions: input.state.hasEmissions,
    hasSafetyInspection: input.state.hasSafetyInspection,
    safetyDetail: input.state.safetyInspectionDetails,
    emissionsDetail: input.state.emissionsDetails,
    hasLemonLaw: input.state.hasLemonLaw,
    citation: input.state.lemonLawCitation,
    lemonSummary: input.state.lemonLawSummary,
    years: input.modelSlug ? (input.yearsByModel[input.makeSlug + "/" + input.modelSlug] || []) : [],
    make: input.makeName,
    model: input.modelName,
    year: input.year,
    body: input.body,
    yearStart: input.model && input.model.yearStart,
    yearEnd: input.model && input.model.yearEnd,
    ordinal: yearIndex >= 0 ? yearIndex + 1 : undefined,
    total: yearList.length || undefined,
    modelOrdinal: modelOrdinal > 0 ? modelOrdinal : undefined,
    modelCount: makeModels.length || undefined,
    founded: input.make.founded,
    country: input.make.country,
    fact: (function () {
      if (factKey && input.facts && input.facts[factKey]) return input.facts[factKey];
      if (input.year || !input.modelSlug || !input.facts) return undefined;
      const list = input.yearsByModel[input.makeSlug + "/" + input.modelSlug] || [];
      for (let i = list.length - 1; i >= 0; i--) {
        const candidate = input.facts[input.makeSlug + "/" + input.modelSlug + "/" + list[i]];
        if (candidate) return Object.assign({ factYear: list[i] }, candidate);
      }
      return undefined;
    })(),
    evIncentives: input.state.evIncentives,
    evDetail: input.state.evIncentiveDetails,
  };
}

function pageText(p) {
  const faqs = geo.geoFaqs(p);
  const parts = [geo.insuranceLead(p), geo.registrationLead(p), geo.lemonLead(p)];
  if (p.evIncentives) parts.push(geo.incentiveLine(p));
  faqs.forEach(function (faq) { parts.push(faq.q, faq.a); });
  geo.recordedLines(p).forEach(function (line) { parts.push(line); });
  return parts.join("\n");
}

function sharedStateAverage(sentence) {
  return /statewide all-vehicle average premium/i.test(sentence);
}

function tokenSentenceCount(text, token) {
  let count = 0;
  allSentences(text).forEach(function (sentence) {
    if (sentence.indexOf(token) !== -1) count += 1;
  });
  return count;
}

function checkGeo() {
  const makes = readJSON("makes.json");
  const models = readJSON("models.json");
  const modelYears = readJSON("modelYears.json");
  const states = readJSON("states.json");
  let facts = {};
  const factsFile = path.join(DATA, "vehicleFacts.json");
  if (fs.existsSync(factsFile)) facts = JSON.parse(fs.readFileSync(factsFile, "utf8")).vehicles || {};

  const makeBySlug = new Map(makes.map(function (m) { return [m.slug, m]; }));
  const modelByKey = new Map(models.map(function (m) { return [m.makeSlug + "/" + m.slug, m]; }));
  const modelsByMake = {};
  models.forEach(function (m) {
    if (!modelsByMake[m.makeSlug]) modelsByMake[m.makeSlug] = [];
    if (!modelsByMake[m.makeSlug].includes(m.slug)) modelsByMake[m.makeSlug].push(m.slug);
  });
  const yearsByModel = {};
  modelYears.forEach(function (row) {
    const key = row.makeSlug + "/" + row.slug;
    if (!yearsByModel[key]) yearsByModel[key] = [];
    yearsByModel[key].push(row.year);
  });
  Object.keys(yearsByModel).forEach(function (key) { yearsByModel[key].sort(function (a, b) { return a - b; }); });

  const within = [];
  const articles = [];
  const padding = [];
  const names = [];
  let pages = 0;

  function consider(id, p) {
    pages += 1;
    const text = pageText(p);
    if (articles.length < 8) articles.push.apply(articles, articleErrors(text, id));
    if (padding.length < 8) {
      PADDING.forEach(function (re) {
        if (re.test(text)) padding.push(id + " contains padding: " + re);
      });
      if (p.clause && p.clause.length > 40 && text.indexOf(p.clause.slice(0, 80)) !== -1) {
        padding.push(id + " pastes the model description");
      }
    }
    const local = new Set();
    sentencesOf(text).forEach(function (sentence) {
      if (!/[.?!]$/.test(sentence)) {
        if (padding.length < 8) padding.push(id + " sentence does not end with a period: " + sentence.slice(0, 120));
      }
      if (sharedStateAverage(sentence)) return;
      const key = exactKey(sentence);
      if (local.has(key)) {
        if (within.length < 5) within.push(id + " repeats: " + sentence.slice(0, 180));
        return;
      }
      local.add(key);
    });
    if (padding.length < 8) {
      semicolonHits(text, id).forEach(function (hit) {
        if (padding.length < 8) padding.push(hit);
      });
      geo.statuteTokens(p.citation).forEach(function (token) {
        if (padding.length >= 8 || token.length < 4) return;
        const inSummary = tokenSentenceCount(p.lemonSummary || "", token);
        const inPage = tokenSentenceCount(text, token);
        if (inPage > Math.max(inSummary, 1)) padding.push(id + " states " + token + " in " + inPage + " sentences");
      });
    }
    if (names.length < 8 && p.year && p.make && p.model && p.stateName) {
      const lower = text.toLowerCase();
      const full = (p.year + " " + p.make + " " + p.model).toLowerCase();
      const inState = full + " in " + String(p.stateName).toLowerCase();
      const nameCount = lower.split(full).length - 1;
      const inCount = lower.split(inState).length - 1;
      if (nameCount > 2) names.push(id + " names the vehicle " + nameCount + " times");
      else if (inCount > 1) names.push(id + " uses the vehicle-in-state phrase " + inCount + " times");
    }
    if (padding.length < 8 && p.stateName) {
      const stateRe = new RegExp("\\bin\\s+" + String(p.stateName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      sentencesOf(text).forEach(function (sentence) {
        if (/fueleconomy\.gov|nhtsa/i.test(sentence) && stateRe.test(sentence) && padding.length < 8) {
          padding.push(id + " puts a national figure in " + p.stateName + ": " + sentence.slice(0, 160));
        }
      });
    }
    if (padding.length < 8 && geo.isElectric(p) && p.hasEmissions && !/does not take the emissions test/i.test(text)) {
      padding.push(id + " is electric but never says the emissions test does not apply");
    }
    const premiums = text.toLowerCase().split("statewide all-vehicle average").length - 1;
    if (premiums > 1 && padding.length < 8) padding.push(id + " states the statewide average " + premiums + " times");
  }

  states.forEach(function (state) {
    makes.forEach(function (make) {
      const base = { make: make, makeName: make.name, makeSlug: make.slug, state: state, modelsByMake: modelsByMake, yearsByModel: yearsByModel, facts: facts };
      consider("make/" + make.slug + "/" + state.slug, bundle(base));
      (modelsByMake[make.slug] || []).forEach(function (modelSlug) {
        const model = modelByKey.get(make.slug + "/" + modelSlug);
        consider(
          "model/" + make.slug + "/" + modelSlug + "/" + state.slug,
          bundle(Object.assign({}, base, { model: model, modelName: model.name, modelSlug: modelSlug, body: model.bodyType }))
        );
      });
    });
    modelYears.forEach(function (row) {
      const make = makeBySlug.get(row.makeSlug);
      const model = modelByKey.get(row.makeSlug + "/" + row.slug);
      if (!make || !model) return;
      consider(
        "year/" + row.makeSlug + "/" + row.slug + "/" + row.year + "/" + state.slug,
        bundle({
          make: make,
          makeName: row.makeName,
          makeSlug: row.makeSlug,
          state: state,
          model: model,
          modelName: row.name,
          modelSlug: row.slug,
          year: row.year,
          body: row.bodyType,
          modelsByMake: modelsByMake,
          yearsByModel: yearsByModel,
          facts: facts,
        })
      );
    });
  });

  return {
    pages: pages,
    within: within,
    articles: articles,
    padding: padding.slice(0, 8),
    names: names.slice(0, 8),
  };
}

function walkHtml(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, visit);
    else if (entry.name.endsWith(".html")) visit(full);
  }
}

function visibleText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function blockText(html) {
  const source = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const chunks = [];
  const re = /<(p|li|h[1-6]|dd|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(source))) {
    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

function checkSite() {
  const site = path.join(ROOT, "_site");
  const errors = [];
  if (!fs.existsSync(site)) {
    errors.push("_site is missing, so JSON-LD parity and the lemon-page duplicate check did not run");
    return errors;
  }
  let files = 0;
  let mismatches = 0;
  const articleHits = [];
  walkHtml(site, function (file) {
    files += 1;
    const html = fs.readFileSync(file, "utf8");
    const bad = faqMismatches(html);
    if (bad.length) {
      mismatches += bad.length;
      if (errors.length < 8) errors.push(path.relative(ROOT, file) + " FAQ JSON-LD does not match the visible answer: " + bad[0].slice(0, 140));
    }
    const plain = visibleText(html);
    if (/next to a file of/i.test(plain) && errors.length < 12) {
      errors.push(path.relative(ROOT, file) + " contains a next-to-a-file padding tail");
    }
    if (errors.length < 12) {
      semicolonHits(blockText(html), path.relative(ROOT, file)).slice(0, 1).forEach(function (hit) { errors.push(hit); });
    }
    if (articleHits.length < 8 && file.includes(path.sep + "makes" + path.sep)) {
      articleHits.push.apply(articleHits, articleErrors(plain, path.relative(ROOT, file)));
    }
  });
  articleHits.slice(0, 8).forEach(function (hit) { errors.push(hit); });

  ["rhode-island", "south-carolina", "virginia"].forEach(function (slug) {
    const file = path.join(site, "states", slug, "lemon-law", "index.html");
    if (!fs.existsSync(file)) {
      errors.push("missing built lemon page for " + slug);
      return;
    }
    const seen = new Map();
    sentencesOf(visibleText(fs.readFileSync(file, "utf8"))).forEach(function (sentence) {
      const key = sentence.toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    seen.forEach(function (count, key) {
      if (count >= 2) errors.push(slug + " lemon page repeats a sentence: " + key.slice(0, 180));
    });
  });

  console.log("built HTML: " + files + " files, " + mismatches + " FAQ mismatches");
  return errors;
}

function checkEdgeSource() {
  const file = path.join(ROOT, "netlify", "edge-functions", "vehicle-pages.ts");
  const text = fs.readFileSync(file, "utf8");
  const errors = [];
  ["must be registered with the state DMV", "requires minimum liability coverage of", "See how much you could save", "Registering a ${"].forEach(function (needle) {
    if (text.includes(needle)) errors.push("vehicle-pages.ts still contains " + JSON.stringify(needle));
  });
  const parts = text.split("function render");
  parts.slice(1).forEach(function (part) {
    const name = part.slice(0, 40).split("(")[0];
    const gos = part.match(/href="\/go\//g) || [];
    if (gos.length > 3) errors.push(name + " has " + gos.length + " /go/ links");
  });
  return errors;
}

function main() {
  const errors = [];
  console.log("checking geo sentences...");
  const geoResult = checkGeo();
  console.log("geo pages: " + geoResult.pages);
  geoResult.within.forEach(function (item) { errors.push("within-page geo repeat: " + item); });
  geoResult.names.forEach(function (item) { errors.push(item); });
  geoResult.articles.forEach(function (item) { errors.push(item); });
  geoResult.padding.forEach(function (item) { errors.push(item); });

  let generatedArticles = 0;
  for (const page of iterPages()) {
    const hits = articleErrors(page.plain, page.id);
    if (hits.length) {
      errors.push(hits[0]);
      generatedArticles += 1;
      if (generatedArticles >= 8) break;
    }
  }
  if (!generatedArticles) console.log("generator articles: clean");

  checkEdgeSource().forEach(function (item) { errors.push(item); });
  checkSite().forEach(function (item) { errors.push(item); });

  if (errors.length) {
    console.error("\nContent check failed:");
    errors.forEach(function (err) { console.error(" - " + err); });
    process.exit(1);
  }
  console.log("content check passed");
}

main();
