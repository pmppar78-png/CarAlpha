"use strict";

/**
 * Make, model, and model-year copy from recorded sources only:
 * EPA fueleconomy.gov rows, NHTSA recalls and NCAP, Wikipedia generation
 * ranges that do not overlap, and a curated segment list.
 *
 * A page with none of those records is not indexable. Sentences are real
 * facts. Nothing here collapses sentences or appends a repeated tie phrase.
 */

const fs = require("fs");
const path = require("path");
const { fixArticles } = require("./article");

const DATA = path.join(__dirname, "..", "src", "_data");
const CURRENT_YEAR = 2026;

let cache = null;

function load() {
  if (cache) return cache;
  const makes = JSON.parse(fs.readFileSync(path.join(DATA, "makes.json"), "utf8"));
  const models = JSON.parse(fs.readFileSync(path.join(DATA, "models.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(DATA, "modelYears.json"), "utf8"));
  const segmentsFile = JSON.parse(fs.readFileSync(path.join(DATA, "segments.json"), "utf8"));
  const factsFile = fs.existsSync(path.join(DATA, "vehicleFacts.json"))
    ? JSON.parse(fs.readFileSync(path.join(DATA, "vehicleFacts.json"), "utf8"))
    : { years: {} };

  const makeBySlug = new Map(makes.map((m) => [m.slug, m]));
  const modelByKey = new Map(models.map((m) => [`${m.makeSlug}/${m.slug}`, m]));
  const yearsByKey = new Map();
  const modelsByMake = new Map();

  for (const row of modelYears) {
    const key = `${row.makeSlug}/${row.slug}`;
    if (!yearsByKey.has(key)) yearsByKey.set(key, []);
    yearsByKey.get(key).push(row.year);
  }
  for (const years of yearsByKey.values()) years.sort((a, b) => a - b);
  for (const model of models) {
    if (!modelsByMake.has(model.makeSlug)) modelsByMake.set(model.makeSlug, []);
    modelsByMake.get(model.makeSlug).push(model);
  }

  const segmentByModel = new Map();
  for (const segment of Object.values(segmentsFile)) {
    for (const key of segment.models) {
      if (modelByKey.has(key)) segmentByModel.set(key, segment);
    }
  }

  const factsByModel = new Map();
  const yearFacts = factsFile.years || {};
  for (const [key, rec] of Object.entries(yearFacts)) {
    const parts = key.split("/");
    const year = Number(parts.pop());
    const modelKey = parts.join("/");
    if (!factsByModel.has(modelKey)) factsByModel.set(modelKey, []);
    factsByModel.get(modelKey).push({ year, rec });
  }
  for (const rows of factsByModel.values()) rows.sort((a, b) => a.year - b.year);

  const descriptionCounts = new Map();
  for (const model of models) {
    for (const sentence of splitSentences(model.description || "")) {
      const masked = maskName(maskName(sentence, model.makeName), model.name)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!masked) continue;
      descriptionCounts.set(masked, (descriptionCounts.get(masked) || 0) + 1);
    }
  }

  const epaTwins = new Map();
  const recallTwins = new Map();
  for (const [key, rec] of Object.entries(yearFacts)) {
    const parts = key.split("/");
    const year = parts.pop();
    const modelKey = parts.join("/");
    const model = modelByKey.get(modelKey);
    if (!model) continue;
    const item = { key: modelKey, label: `${model.makeName} ${model.name}` };
    if (rec.epa) {
      if (!epaTwins.has(rec.epa.idMin)) epaTwins.set(rec.epa.idMin, []);
      epaTwins.get(rec.epa.idMin).push(item);
    }
    if (rec.recalls && rec.recalls.campaigns && rec.recalls.campaigns.length) {
      const sig = `${year}|${rec.recalls.campaigns.map((row) => row.id).slice().sort().join(",")}`;
      if (!recallTwins.has(sig)) recallTwins.set(sig, []);
      recallTwins.get(sig).push(item);
    }
  }

  cache = {
    makes,
    models,
    modelYears,
    makeBySlug,
    modelByKey,
    yearsByKey,
    modelsByMake,
    segmentByModel,
    yearFacts,
    factsByModel,
    yearFacts,
    descriptionCounts,
    epaTwins,
    recallTwins,
    sources: factsFile.sources || {},
    built: factsFile.built || null,
    vehicles: factsFile.vehicles || {},
    remedy: JSON.parse(fs.readFileSync(path.join(DATA, "recallRemedy.json"), "utf8")),
  };
  return cache;
}

function maskName(sentence, name) {
  if (!name) return sentence;
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = String(name).length >= 4 ? "gi" : "g";
  return String(sentence).replace(new RegExp("\\b" + escaped + "\\b", flags), "{name}");
}

function vinYearCode(year) {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V", "W", "X", "Y"];
  if (year >= 1980 && year <= 2000) return letters[year - 1980];
  if (year >= 2001 && year <= 2009) return String(year - 2000);
  if (year >= 2010 && year <= 2030) return letters[year - 2010];
  return null;
}

function listNames(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function clean(value) {
  return String(value || "").replace(/[.?!]+/g, "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return String(text)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function idSpan(idMin, idMax) {
  return idMin === idMax ? `vehicle id ${idMin}` : `vehicle ids ${idMin} through ${idMax}`;
}

function span(pair) {
  if (!pair || !pair.length) return "";
  return pair[0] === pair[1] ? String(pair[0]) : `${pair[0]} to ${pair[1]}`;
}

function otherNames(list, makeSlug, slug) {
  const key = `${makeSlug}/${slug}`;
  const names = [];
  const seen = new Set();
  for (const item of list || []) {
    if (item.key === key || seen.has(item.label)) continue;
    seen.add(item.label);
    names.push(item.label);
  }
  names.sort();
  return names;
}

function twinPhrase(names) {
  if (!names.length) return "";
  return `, also matched to ${listNames(names)}`;
}

function epaTwinPhrase(idMin, makeSlug, slug) {
  return twinPhrase(otherNames(load().epaTwins.get(idMin), makeSlug, slug));
}

function recallTwinPhrase(recalls, year, makeSlug, slug) {
  if (!recalls || !recalls.campaigns || !recalls.campaigns.length) return "";
  const sig = `${year}|${recalls.campaigns.map((row) => row.id).slice().sort().join(",")}`;
  return twinPhrase(otherNames(load().recallTwins.get(sig), makeSlug, slug));
}

function remedySentence(anchor, also, scope) {
  return `For the ${scope} ${anchor}${also}, 49 USC § 30120(g)(1) withholds the no-charge safety remedy when the first purchaser bought the vehicle more than 15 calendar years before notice under § 30118(c) or an order under § 30118(b), whichever is earlier.`;
}

function firstClause(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const cut = raw.split(/[.?!]/)[0].trim();
  return cut || raw;
}

function yearKey(entry) {
  return `${entry.makeSlug}/${entry.slug}/${entry.year}`;
}

function modelKeyOf(model) {
  return `${model.makeSlug}/${model.slug}`;
}

function position(entry) {
  const years = load().yearsByKey.get(`${entry.makeSlug}/${entry.slug}`) || [entry.year];
  const index = Math.max(0, years.indexOf(entry.year));
  return {
    years,
    index,
    ordinal: index + 1,
    total: years.length,
    prev: index > 0 ? years[index - 1] : null,
    next: index < years.length - 1 ? years[index + 1] : null,
  };
}

function yearHasRecordedData(rec) {
  if (!rec) return false;
  const epa = rec.epa && (Number(rec.epa.count) > 0 || (rec.epa.configs && rec.epa.configs.length > 0));
  const recalls = rec.recalls && (Number(rec.recalls.count) > 0 || (rec.recalls.campaigns && rec.recalls.campaigns.length > 0));
  const complaints = rec.complaints && Number(rec.complaints.count) > 0;
  const ncap = ratedRows(rec.ncap).length > 0;
  return Boolean(epa || recalls || complaints || ncap);
}

function yearIndexable(entry) {
  return yearHasRecordedData(load().yearFacts[yearKey(entry)]);
}

function modelIndexable(model) {
  return load().factsByModel.has(modelKeyOf(model));
}

function rivalNames(makeSlug, slug, year) {
  const data = load();
  const segment = data.segmentByModel.get(`${makeSlug}/${slug}`);
  if (!segment) return null;
  const selfYears = data.yearsByKey.get(`${makeSlug}/${slug}`) || [];
  const focusYear = year != null ? year : selfYears[selfYears.length - 1];
  if (focusYear == null) return null;
  const names = [];
  for (const key of segment.models) {
    if (key === `${makeSlug}/${slug}`) continue;
    const years = data.yearsByKey.get(key) || [];
    if (!years.includes(focusYear)) continue;
    // "Sold for <year>" needs evidence: an EPA-certified configuration for that year.
    const rivalRec = (data.yearFacts || {})[`${key}/${focusYear}`];
    if (!rivalRec || !rivalRec.epa || !(Number(rivalRec.epa.count) > 0)) continue;
    const model = data.modelByKey.get(key);
    if (!model) continue;
    names.push(`${model.makeName} ${model.name}`);
  }
  if (!names.length) return null;
  return { label: segment.label, year: focusYear, names };
}

function componentPhrase(component) {
  const parts = String(component || "")
    .split(":")
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  if (!parts.length) return "recorded component";
  return parts.map((part) => part.replace(/\bair bags\b/g, "air bag")).join(" ");
}

function campaignKind(id) {
  const match = String(id || "").match(/^\d{2}([ET])/);
  if (!match) return "";
  return match[1] === "E" ? "equipment recall" : "tire recall";
}

function ratedRows(ncap) {
  if (!ncap || !ncap.rows) return [];
  return ncap.rows.filter((row) => /^[1-5]$/.test(String(row.overall == null ? "" : row.overall).trim()));
}

const { plainRecallLabel, oneSentence } = require("./recall-labels");

function campaignLabel(row) {
  return plainRecallLabel(row && row.component, row && row.summary);
}

function campaignPhrase(recalls) {
  const parts = (recalls.campaigns || []).map((row) => {
    const kind = (row && row.kind) || campaignKind(row && row.id);
    const kindBit = kind ? `, ${kind.startsWith("e") ? "an" : "a"} ${kind},` : "";
    return `${row.id}${kindBit} for the ${campaignLabel(row)}`;
  });
  if (!parts.length) return `${recalls.count} campaigns`;
  return listNames(parts);
}

function decorateCampaign(row) {
  const kind = (row && row.kind) || campaignKind(row && row.id);
  return {
    id: row.id,
    component: row.component || "",
    label: campaignLabel(row),
    kind,
    summary: oneSentence(row.summary),
    consequence: oneSentence(row.consequence),
    remedy: oneSentence(row.remedy),
  };
}

function epaSentence(year, make, model, epa) {
  const fuels = listNames(epa.fuels.map(clean));
  const classes = listNames(epa.classes.map(clean));
  const noun = epa.count === 1 ? "configuration" : "configurations";
  return `Fueleconomy.gov lists ${epa.count} ${year} ${make} ${model} ${noun}, with city ${span(epa.city)} mpg, highway ${span(epa.hwy)} mpg, and combined ${span(epa.comb)} mpg on ${fuels}, classed as ${classes}.`;
}

function recallSentence(year, make, model, recalls) {
  return `NHTSA recalls-by-vehicle lists ${campaignPhrase(recalls)} for the ${year} ${make} ${model}.`;
}

function ncapBits(rows) {
  return listNames(rows.map((row) => `${clean(row.desc)} at ${clean(row.overall)} stars overall`));
}

function ncapSentence(rows) {
  return `NHTSA NCAP rates ${ncapBits(rows)}.`;
}

function generationSentence(year, make, model, generation) {
  const end = generation.end == null ? "present" : String(generation.end);
  return `The Wikipedia infobox places the ${year} ${make} ${model} in ${clean(generation.name)}, year ${generation.index} of the ${generation.start} to ${end} run.`;
}

function rivalSentence(rivals, epa) {
  const mpg = epa ? `, when combined mileage runs ${span(epa.comb)} mpg,` : "";
  return `Other ${rivals.label} models sold for ${rivals.year}${mpg} are ${listNames(rivals.names.map(clean))}.`;
}

function emptyCopy(extra) {
  return Object.assign({
    indexable: false,
    paragraphs: ["No EPA or NHTSA match."],
    blurbs: { insurance: "", warranty: "", financing: "", selling: "" },
    faqs: [],
    faqSchema: null,
    facts: null,
    plain: "No EPA or NHTSA match.",
  }, extra);
}

function faqSchema(faqs) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function yearCopy(entry) {
  const data = load();
  const rec = data.yearFacts[yearKey(entry)];
  const pos = position(entry);
  const make = data.makeBySlug.get(entry.makeSlug);
  const model = data.modelByKey.get(`${entry.makeSlug}/${entry.slug}`);
  const ctx = {
    ordinal: pos.ordinal,
    total: pos.total,
    age: CURRENT_YEAR - entry.year,
    vinCode: vinYearCode(entry.year),
    yearStart: model ? model.yearStart : pos.years[0],
    yearEnd: model ? model.yearEnd : null,
    country: make ? make.country : "",
    founded: make ? make.founded : null,
    prev: pos.prev,
    next: pos.next,
  };
  if (!rec) return emptyCopy({ ctx, stats: null });

  const makeName = entry.makeName;
  const modelName = entry.name;
  const rated = ratedRows(rec.ncap);
  const paragraphs = [];
  if (rec.epa) paragraphs.push(fixArticles(epaSentence(entry.year, makeName, modelName, rec.epa)));
  if (rec.recalls && rec.recalls.count > 0 && rec.recalls.campaigns && rec.recalls.campaigns.length) {
    paragraphs.push(fixArticles(recallSentence(entry.year, makeName, modelName, rec.recalls)));
  }
  if (rated.length) paragraphs.push(fixArticles(ncapSentence(rated)));
  if (rec.generation) paragraphs.push(fixArticles(generationSentence(entry.year, makeName, modelName, rec.generation)));
  const rivals = rivalNames(entry.makeSlug, entry.slug, entry.year);
  if (rivals) paragraphs.push(fixArticles(rivalSentence(rivals, rec.epa)));

  const blurbs = { insurance: "", warranty: "", financing: "", selling: "" };
  const faqs = [];
  if (rec.recalls && rec.recalls.count > 0 && rec.recalls.campaigns && rec.recalls.campaigns.length) {
    faqs.push({ q: "Which recalls are on file?", a: paragraphs.find((line) => line.includes("recalls-by-vehicle")) });
  }
  if (rated.length) {
    faqs.push({ q: "What NCAP scores are on file?", a: paragraphs.find((line) => line.includes("NCAP")) });
  }
  if (rivals) {
    faqs.push({ q: "Which same-year rivals are on file?", a: paragraphs.find((line) => line.startsWith("Other ")) });
  }

  const plainParts = paragraphs.slice();
  for (const faq of faqs) if (faq.a) plainParts.push(`${faq.q} ${faq.a}`);

  return {
    indexable: yearHasRecordedData(rec),
    ctx,
    paragraphs,
    blurbs,
    faqs: faqs.filter((faq) => faq.a),
    faqSchema: faqSchema(faqs.filter((faq) => faq.a)),
    facts: {
      epa: rec.epa || null,
      recalls: rec.recalls && rec.recalls.count > 0 ? Object.assign({}, rec.recalls, {
        campaigns: (rec.recalls.campaigns || []).map(decorateCampaign),
      }) : null,
      ncap: rated.length ? { rows: rated } : null,
      generation: rec.generation || null,
      rivals,
      complaints: rec.complaints && Number(rec.complaints.count) > 0 ? rec.complaints : null,
    },
    plain: plainParts.join("\n"),
    stats: null,
  };
}

function summarizeModel(model) {
  const rows = load().factsByModel.get(modelKeyOf(model)) || [];
  if (!rows.length) return null;
  let epaCount = 0;
  let idMin = Infinity;
  let idMax = -Infinity;
  let combMin = Infinity;
  let combMax = -Infinity;
  const fuels = new Set();
  const classes = new Set();
  let yearsWithCampaigns = 0;
  let busiest = null;
  const generations = [];
  let ncapSample = null;
  for (const { year, rec } of rows) {
    if (rec.epa) {
      epaCount += rec.epa.count;
      idMin = Math.min(idMin, rec.epa.idMin);
      idMax = Math.max(idMax, rec.epa.idMax);
      combMin = Math.min(combMin, rec.epa.comb[0]);
      combMax = Math.max(combMax, rec.epa.comb[1]);
      rec.epa.fuels.forEach((fuel) => fuels.add(fuel));
      rec.epa.classes.forEach((cls) => classes.add(cls));
    }
    if (rec.recalls && rec.recalls.count > 0) {
      yearsWithCampaigns += 1;
      if (!busiest || rec.recalls.count > busiest.count) {
        busiest = { year, count: rec.recalls.count, campaigns: rec.recalls.campaigns };
      }
    }
    if (rec.generation) {
      const id = `${rec.generation.name}|${rec.generation.start}|${rec.generation.end}`;
      if (!generations.some((row) => row.id === id)) generations.push(Object.assign({ id }, rec.generation));
    }
    const rated = ratedRows(rec.ncap);
    if (rated.length) ncapSample = { year, rows: rated };
  }
  return {
    yearCount: rows.length,
    oldest: rows[0].year,
    newest: rows[rows.length - 1].year,
    epa: epaCount
      ? {
          count: epaCount,
          idMin,
          idMax,
          comb: [combMin, combMax],
          fuels: [...fuels],
          classes: [...classes],
        }
      : null,
    yearsWithCampaigns,
    busiest,
    generations,
    ncapSample,
  };
}

function modelCopy(model) {
  const data = load();
  const years = data.yearsByKey.get(modelKeyOf(model)) || [];
  const gaps = [];
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] > 1) gaps.push(`${years[i - 1]} to ${years[i]}`);
  }
  const stats = { count: years.length, oldest: years[0], newest: years[years.length - 1], gaps };
  const summary = summarizeModel(model);
  if (!summary) return emptyCopy({ ctx: null, stats });

  const paragraphs = [];
  if (summary.epa) {
    paragraphs.push(fixArticles(
      `Fueleconomy.gov lists ${summary.epa.count} ${model.makeName} ${model.name} configurations, and combined mileage across those rows runs ${span(summary.epa.comb)} mpg on ${listNames(summary.epa.fuels.map(clean))}.`
    ));
  }
  if (summary.busiest) {
    const campaignWord = summary.busiest.count === 1 ? "campaign" : "campaigns";
    paragraphs.push(fixArticles(
      `NHTSA returned campaigns in ${summary.yearsWithCampaigns} of the ${summary.yearCount} ${model.makeName} ${model.name} years with a source match, and the busiest of those years is ${summary.busiest.year} with ${summary.busiest.count} ${campaignWord}, listed on that year page.`
    ));
  }
  if (summary.generations.length) {
    const bits = summary.generations.map((gen) => {
      const end = gen.end == null ? "present" : String(gen.end);
      return `${clean(gen.name)} (${gen.start} to ${end})`;
    });
    paragraphs.push(fixArticles(
      `Wikipedia generation ranges kept for the ${model.makeName} ${model.name} are ${listNames(bits)}.`
    ));
  }
  if (summary.ncapSample) {
    paragraphs.push(fixArticles(
      `NHTSA NCAP's newest overall rating on file is ${ncapBits(summary.ncapSample.rows)}.`
    ));
  }
  const rivals = rivalNames(model.makeSlug, model.slug, null);
  if (rivals) paragraphs.push(fixArticles(rivalSentence(rivals, null)));
  for (const sentence of splitSentences(model.description || "")) {
    const masked = maskName(maskName(sentence, model.makeName), model.name)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (data.descriptionCounts.get(masked) === 1) paragraphs.push(fixArticles(sentence));
  }

  const blurbs = { insurance: "", warranty: "", financing: "", selling: "" };
  const faqs = [];
  if (summary.epa) {
    faqs.push({
      q: "What combined mileage is on file?",
      a: paragraphs.find((line) => line.includes("Fueleconomy.gov")),
    });
  }
  if (summary.ncapSample) {
    faqs.push({
      q: "What NCAP rating is on file?",
      a: paragraphs.find((line) => line.includes("NCAP")),
    });
  }
  if (rivals) {
    faqs.push({
      q: "Which current rivals are on file?",
      a: paragraphs.find((line) => line.startsWith("Other ")),
    });
  }

  const plainParts = paragraphs.slice();
  for (const faq of faqs) if (faq.a) plainParts.push(`${faq.q} ${faq.a}`);

  const visibleFaqs = faqs.filter((faq) => faq.a);
  return {
    indexable: true,
    paragraphs,
    blurbs,
    faqs: visibleFaqs,
    faqSchema: faqSchema(visibleFaqs),
    facts: Object.assign({ rivals }, summary),
    plain: plainParts.join("\n"),
    stats,
    ctx: null,
  };
}

function makeFaqs(make) {
  const data = load();
  const modelRecords = data.modelsByMake.get(make.slug) || [];
  const names = modelRecords.map((model) => model.name);
  let yearCount = 0;
  for (const model of modelRecords) {
    yearCount += (data.yearsByKey.get(make.slug + "/" + model.slug) || []).length;
  }
  const listed = listNames(names.slice(0, 6));
  const clause = firstClause(make.description);
  const remedy = data.remedy && data.remedy.text ? data.remedy.text : "";
  const faqs = [
    {
      q: `How do I decode a ${make.name} VIN?`,
      a: `The decoder on this page sends the 17-character VIN to NHTSA vPIC and returns the year, model, body, engine, and plant. ${clause}. This catalog files ${modelRecords.length} ${make.name} models and ${yearCount} model years for the ${make.country} marque founded in ${make.founded}.`,
    },
    {
      q: `How do I check recalls on a ${make.name}?`,
      a: `Use the VIN in the recall checker. NHTSA's recalls-by-vehicle feed is make, model, and year, and the dealer then matches the VIN. ${remedy}`,
    },
    {
      q: `Which ${make.name} models are filed here?`,
      a: `${clause}. The model list includes ${listed}${names.length > 6 ? ", plus " + (names.length - 6) + " more" : ""}. Open a model for its year span and body style.`,
    },
    {
      q: `Is a ${make.name} VIN decode free?`,
      a: `Yes. Decoding a ${make.name} VIN on this page uses NHTSA vPIC with no account and no fee. The index behind it is ${yearCount} model years across ${modelRecords.length} models, founded ${make.founded} in ${make.country}.`,
    },
  ];
  return faqs.map((faq) => ({ q: fixArticles(faq.q), a: fixArticles(faq.a) }));
}

function iterPages() {
  const data = load();
  const pages = [];
  for (const entry of data.modelYears) {
    const copy = yearCopy(entry);
    pages.push({
      id: `/makes/${entry.makeSlug}/${entry.slug}/${entry.year}/`,
      kind: "year",
      make: entry.makeName,
      model: entry.name,
      year: entry.year,
      plain: copy.plain,
    });
  }
  for (const model of data.models) {
    const copy = modelCopy(model);
    pages.push({
      id: `/makes/${model.makeSlug}/${model.slug}/`,
      kind: "model",
      make: model.makeName,
      model: model.name,
      year: null,
      plain: copy.plain,
    });
  }
  return pages;
}

module.exports = {
  CURRENT_YEAR,
  yearCopy,
  modelCopy,
  makeFaqs,
  iterPages,
  vinYearCode,
  load,
  yearIndexable,
  modelIndexable,
  componentPhrase,
  campaignKind,
};
