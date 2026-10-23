"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const geo = require("../lib/geo-copy");
const { articleFor } = require("../lib/article");

const states = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/_data/states.json"), "utf8"));
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/_data/vehicleFacts.json"), "utf8")).vehicles || {};
const modelYears = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/_data/modelYears.json"), "utf8"));

function yearsOf(make, slug) {
  return modelYears.filter(function (row) { return row.makeSlug === make && row.slug === slug; })
    .map(function (row) { return row.year; })
    .sort(function (a, b) { return a - b; });
}

function bundle(state, extra) {
  return Object.assign({
    stateName: state.name,
    minimum: state.insuranceMinimum,
    minimumDetail: state.insuranceMinimumDetail,
    avgCost: state.averageInsuranceCost,
    registrationFee: state.registrationFeeRange,
    registrationNotes: state.registrationNotes,
    titleFee: state.titleFee,
    plateFee: state.plateFee,
    hasEmissions: state.hasEmissions,
    hasSafetyInspection: state.hasSafetyInspection,
    safetyDetail: state.safetyInspectionDetails,
    emissionsDetail: state.emissionsDetails,
    hasLemonLaw: state.hasLemonLaw,
    citation: state.lemonLawCitation,
    lemonSummary: state.lemonLawSummary,
    evIncentives: state.evIncentives,
    evDetail: state.evIncentiveDetails,
  }, extra);
}

function pageText(p) {
  const faqs = geo.geoFaqs(p);
  const parts = [geo.insuranceLead(p), geo.registrationLead(p), geo.lemonLead(p)];
  if (p.evIncentives) parts.push(geo.incentiveLine(p));
  faqs.forEach(function (faq) { parts.push(faq.q, faq.a); });
  geo.recordedLines(p).forEach(function (line) { parts.push(line); });
  return parts.join("\n");
}

function sentences(text) {
  const protectedText = String(text).replace(/\b((?:[A-Z][a-z]{0,3}|[A-Z]{1,4}|tit|ch|sec))\.\s+/g, "$1.\u2060 ");
  return protectedText.split(/(?<=[.?!])\s+/).map(function (s) {
    return s.replace(/\u2060/g, "").replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

test("geo pages answer with figures and do not pad", function () {
  const tx = states.find(function (s) { return s.slug === "texas"; });
  const ma = states.find(function (s) { return s.slug === "massachusetts"; });
  const va = states.find(function (s) { return s.slug === "virginia"; });
  const camry = bundle(tx, {
    make: "Toyota",
    model: "Camry",
    year: 2020,
    years: yearsOf("toyota", "camry"),
    fact: facts["toyota/camry/2020"],
  });
  const tesla = bundle(ma, {
    make: "Tesla",
    model: "Model 3",
    year: 2024,
    years: yearsOf("tesla", "model-3"),
    fact: facts["tesla/model-3/2024"],
  });
  const virginia = bundle(va, {
    make: "Toyota",
    model: "Camry",
    year: 2020,
    years: yearsOf("toyota", "camry"),
    fact: facts["toyota/camry/2020"],
  });

  [camry, tesla, virginia].forEach(function (page) {
    const text = pageText(page);
    assert.equal(/next to a file of/i.test(text), false);
    sentences(text).forEach(function (sentence) {
      assert.ok((sentence.match(/;/g) || []).length < 4, sentence);
      assert.match(sentence, /[.?!]$/);
    });
    const faqs = geo.geoFaqs(page);
    const html = geo.faqHtml(faqs);
    const schema = JSON.parse(geo.faqSchemaScript(faqs).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
    faqs.forEach(function (faq, index) {
      assert.match(html, new RegExp(faq.a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(schema.mainEntity[index].acceptedAnswer.text, faq.a);
      assert.equal(/see the fee figures above|the citation is shown above/i.test(faq.a), false);
    });
    assert.match(faqs[1].a, /\$/);
  });

  const camryText = pageText(camry);
  assert.equal(camryText.toLowerCase().split("2020 toyota camry in texas").length - 1, 1);
  assert.equal(/fueleconomy\.gov[^.?!]*\bin Texas\b/i.test(camryText), false);
  assert.match(camryText, /HB 3297/);
  assert.match(camryText, /\$7\.50/);
  assert.match(camryText, /\$1,917\.05/);
  assert.equal(camryText.toLowerCase().split("statewide all-vehicle average").length - 1, 1);
  assert.match(pageText(tesla), /does not take the emissions test/);
  assert.equal(/fueleconomy\.gov[^.?!]*\bin Massachusetts\b/i.test(pageText(tesla)), false);

  const vaText = pageText(virginia);
  assert.equal(vaText.split("59.1-207.13").length - 1, 1);
  assert.equal(vaText.split("59.1-207.11").length - 1, 1);
  assert.match(vaText, /15 more days/);
  assert.match(vaText, /written notification is required/);
});

test("every state keeps a readable lemon citation and no padded sentence", function () {
  const years = yearsOf("toyota", "camry");
  const fact = facts["toyota/camry/2020"];
  states.forEach(function (state) {
    const page = bundle(state, { make: "Toyota", model: "Camry", year: 2020, years: years, fact: fact });
    const text = pageText(page);
    assert.equal(/next to a file of/i.test(text), false, state.slug);
    sentences(text).forEach(function (sentence) {
      assert.ok((sentence.match(/;/g) || []).length < 4, state.slug + ": " + sentence);
    });
    const re = /\b(an?)(\s+)([A-Za-z0-9][A-Za-z0-9.'’-]+)/gi;
    let match;
    while ((match = re.exec(text))) {
      assert.equal(match[1].toLowerCase(), articleFor(match[3]), state.slug + ": " + match[0]);
    }
    const seen = new Set();
    sentences(text).forEach(function (sentence) {
      if (sentence.split(/\s+/).length < 8) return;
      const key = sentence.toLowerCase();
      assert.equal(seen.has(key), false, state.slug + " repeats " + sentence);
      seen.add(key);
    });
    geo.statuteTokens(state.lemonLawCitation).forEach(function (token) {
      if (token.length < 4) return;
      const inSummary = sentences(state.lemonLawSummary || "").filter(function (s) { return s.includes(token); }).length;
      const inPage = sentences(text).filter(function (s) { return s.includes(token); }).length;
      assert.ok(inPage <= Math.max(inSummary, 1), state.slug + " " + token + " " + inPage + ">" + inSummary);
    });
  });
});
