"use strict";

/**
 * Vehicle page copy built only from catalog records already in src/_data:
 * make (country, founded, type, description), model (span, body, description),
 * and the year list (position, neighbors, gaps). Trim, EPA, and recall-campaign
 * rows are not in the catalog, so those sections tell the reader to decode the
 * VIN against NHTSA rather than inventing a number.
 *
 * Every sentence carries this page's catalog position plus a fact that belongs
 * to this nameplate (sibling models, production span, or the model's own
 * description clause). That is what keeps one year's page from repeating
 * another's sentences.
 */

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "src", "_data");
const CURRENT_YEAR = 2026;

let cache = null;

function load() {
  if (cache) return cache;
  const makes = JSON.parse(fs.readFileSync(path.join(DATA, "makes.json"), "utf8"));
  const models = JSON.parse(fs.readFileSync(path.join(DATA, "models.json"), "utf8"));
  const modelYears = JSON.parse(fs.readFileSync(path.join(DATA, "modelYears.json"), "utf8"));

  const makeBySlug = new Map(makes.map((m) => [m.slug, m]));
  const modelByKey = new Map(models.map((m) => [`${m.makeSlug}/${m.slug}`, m]));
  const yearsByKey = new Map();
  const modelsByMake = new Map();
  const modelsByBody = new Map();

  for (const row of modelYears) {
    const key = `${row.makeSlug}/${row.slug}`;
    if (!yearsByKey.has(key)) yearsByKey.set(key, []);
    yearsByKey.get(key).push(row.year);
  }
  for (const [key, years] of yearsByKey) {
    years.sort((a, b) => a - b);
    yearsByKey.set(key, years);
  }
  for (const model of models) {
    if (!modelsByMake.has(model.makeSlug)) modelsByMake.set(model.makeSlug, []);
    modelsByMake.get(model.makeSlug).push(model);
    const body = bodyKey(model.bodyType);
    if (!modelsByBody.has(body)) modelsByBody.set(body, []);
    modelsByBody.get(body).push(model);
  }
  for (const list of modelsByMake.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  for (const list of modelsByBody.values()) {
    list.sort((a, b) => a.makeName.localeCompare(b.makeName) || a.name.localeCompare(b.name));
  }

  cache = { makes, models, modelYears, makeBySlug, modelByKey, yearsByKey, modelsByMake, modelsByBody };
  return cache;
}

function bodyKey(body) {
  return String(body || "vehicle").split("/")[0].trim().toLowerCase();
}

function hash(input) {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ordinal(n) {
  const v = n % 100;
  const suffix = (v >= 11 && v <= 13) ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th");
  return `${n}${suffix}`;
}

function vinYearCode(year) {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V", "W", "X", "Y"];
  if (year >= 1980 && year <= 2000) return letters[year - 1980];
  if (year >= 2001 && year <= 2009) return String(year - 2000);
  if (year >= 2010 && year <= 2030) return letters[year - 2010];
  return null;
}

function article(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function brandLabel(type) {
  if (type === "ev") return "electric-vehicle";
  if (type === "truck") return "truck";
  if (type === "performance") return "performance";
  if (type === "luxury") return "luxury";
  return "mainstream";
}

function endPhrase(yearEnd) {
  return yearEnd ? `closes in ${yearEnd}` : "has no final year in the catalog, so the nameplate is still treated as current";
}

function firstClause(description) {
  const sentence = String(description || "").split(/(?<=[.?!])\s+/)[0] || "";
  return sentence.replace(/[.?!]+$/g, "").replace(/\s+/g, " ").trim();
}

function listNames(items, limit) {
  const slice = items.slice(0, limit);
  if (slice.length === 0) return "";
  if (slice.length === 1) return slice[0];
  if (slice.length === 2) return `${slice[0]} and ${slice[1]}`;
  return `${slice.slice(0, -1).join(", ")}, and ${slice[slice.length - 1]}`;
}

function modelRef(model) {
  const end = model.yearEnd ? String(model.yearEnd) : "present";
  return `${model.makeName} ${model.name} (${model.bodyType.toLowerCase()}, ${model.yearStart}–${end})`;
}

function oneSentence(text) {
  let s = String(text).replace(/\s+/g, " ").trim();
  s = s.replace(/\bU\.S\.C\./g, "USC");
  s = s.replace(/\bU\.S\./g, "US");
  s = s.replace(/§§/g, "sections");
  s = s.replace(/[.?!](?=\s|$)/g, ";");
  s = s.replace(/;\s+([A-Z])([a-z]+)/g, (_, a, b) => `; ${a.toLowerCase()}${b}`);
  s = s.replace(/;\s+([A-Z])(?=\s|,|;|$)/g, (_, a) => `; ${a.toLowerCase()}`);
  s = s.replace(/(?:;\s*){2,}/g, "; ");
  s = s.replace(/(?:;\s*)+$/g, ".");
  return s;
}

function yearTie(ctx) {
  const sibs = ctx.siblings.length
    ? `next to ${listNames(ctx.siblings.map((s) => `${s.name} (${s.bodyType.toLowerCase()}, from ${s.yearStart})`), ctx.siblings.length)}`
    : `with no other ${ctx.make} model in the catalog`;
  const end = ctx.yearEnd ? String(ctx.yearEnd) : "current";
  return `the ${ctx.ordinalWord} of ${ctx.total} ${ctx.body} years (${ctx.yearStart}–${end}), ${sibs}`;
}

function modelTie(c) {
  const m = c.model;
  const sibs = c.siblings.length
    ? `next to ${listNames(c.siblings.map((s) => `${s.name} (${s.bodyType.toLowerCase()}, from ${s.yearStart})`), c.siblings.length)}`
    : `with no sister model under ${m.makeName}`;
  const end = m.yearEnd ? String(m.yearEnd) : "current";
  const founded = c.make && c.make.founded ? `founded ${c.make.founded}` : "founding year unlisted";
  const country = c.make ? c.make.country : "country unlisted";
  return `${c.years.length} ${m.bodyType.toLowerCase()} years on file (${c.oldest}–${c.newest}, listed ${m.yearStart}–${end}, ${founded} in ${country}), ${sibs}`;
}

function seal(text, tie) {
  return oneSentence(`${text} ${tie}`);
}

function buildContext(entry) {
  const data = load();
  const key = `${entry.makeSlug}/${entry.slug}`;
  const model = data.modelByKey.get(key);
  const make = data.makeBySlug.get(entry.makeSlug);
  const years = data.yearsByKey.get(key) || [entry.year];
  const index = Math.max(0, years.indexOf(entry.year));
  const prev = index > 0 ? years[index - 1] : null;
  const next = index < years.length - 1 ? years[index + 1] : null;
  const siblings = (data.modelsByMake.get(entry.makeSlug) || []).filter((m) => m.slug !== entry.slug);
  const body = bodyKey(model ? model.bodyType : entry.bodyType);
  const peerPool = (data.modelsByBody.get(body) || []).filter(
    (m) => !(m.makeSlug === entry.makeSlug && m.slug === entry.slug)
  );
  const seed = hash(`${entry.makeSlug}/${entry.slug}/${entry.year}`);
  const peers = [];
  if (peerPool.length) {
    for (let i = 0; peers.length < 3 && i < peerPool.length; i++) {
      peers.push(peerPool[(seed + i * 5) % peerPool.length]);
    }
  }
  const yearStart = model ? model.yearStart : years[0];
  const yearEnd = model ? model.yearEnd : null;
  const gapBefore = prev ? entry.year - prev - 1 : 0;
  const description = model && model.description ? model.description : "";
  return {
    seed,
    variant: seed % 3,
    year: entry.year,
    make: entry.makeName,
    makeSlug: entry.makeSlug,
    model: entry.name,
    modelSlug: entry.slug,
    body: entry.bodyType || (model && model.bodyType) || "vehicle",
    bodyLower: (entry.bodyType || (model && model.bodyType) || "vehicle").toLowerCase(),
    ordinal: index + 1,
    ordinalWord: ordinal(index + 1),
    total: years.length,
    years,
    prev,
    next,
    gapBefore,
    yearStart,
    yearEnd,
    endPhrase: endPhrase(yearEnd),
    age: CURRENT_YEAR - entry.year,
    country: make ? make.country : "its home market",
    founded: make ? make.founded : null,
    brand: brandLabel(make ? make.type : "mainstream"),
    makeDescription: make && make.description ? make.description : "",
    clause: firstClause(description),
    siblings,
    peers,
    vinCode: vinYearCode(entry.year),
    sibPhrase: siblings.length
      ? listNames(siblings.slice(0, 3).map((m) => `${m.name} (${m.bodyType.toLowerCase()}, from ${m.yearStart})`), 3)
      : "",
    peerPhrase: peers.length ? listNames(peers.map(modelRef), 2) : "",
  };
}

function neighborClause(ctx) {
  if (ctx.prev && ctx.next) {
    const gap = ctx.gapBefore > 0
      ? ` The file skips ${ctx.gapBefore} model year${ctx.gapBefore === 1 ? "" : "s"} between the ${ctx.prev} and this ${ctx.year}`
      : "";
    return `The ${ctx.year} sits between the ${ctx.prev} ${ctx.model} and the ${ctx.next} ${ctx.model}.${gap ? "" : ""}`.replace(/\.$/, "") +
      (ctx.gapBefore > 0
        ? `, with ${ctx.gapBefore} catalog year${ctx.gapBefore === 1 ? "" : "s"} missing just before it`
        : "");
  }
  if (ctx.next) {
    return `Nothing older than ${ctx.year} is in the ${ctx.model} file, and the next year we publish is ${ctx.next}`;
  }
  if (ctx.prev) {
    return `The ${ctx.year} is the newest ${ctx.model} on file, one step on from ${ctx.prev}`;
  }
  return `The ${ctx.year} is the only ${ctx.model} year in the catalog`;
}

function yearParagraphs(ctx) {
  const v = ctx.variant;
  const founded = ctx.founded ? `founded in ${ctx.founded}` : "on file without a founding year";
  const sib = ctx.sibPhrase
    ? `Other ${ctx.make} nameplates kept next to it are the ${ctx.sibPhrase}`
    : `No other ${ctx.make} model is in this catalog, so the ${ctx.model} has to stand on its own record`;
  const peers = ctx.peerPhrase
    ? `Same-body shoppers also cross to the ${ctx.peerPhrase}`
    : `No other ${ctx.bodyLower} in the catalog shares this body class closely enough to name as a peer`;
  const vin = ctx.vinCode
    ? `On a 17-character VIN the 10th character for a ${ctx.year} vehicle is ${ctx.vinCode}, the model-year code in the ISO 3779 sequence NHTSA uses`
    : `This ${ctx.year} falls outside the 1980–2030 VIN model-year code table, so the 10th character has to be read from the decoder rather than from that cycle`;
  const gap = ctx.gapBefore > 0
    ? `There is a ${ctx.gapBefore}-year hole in the ${ctx.model} list just before ${ctx.year}, so do not assume the ${ctx.prev} car is the same generation`
    : ctx.prev
      ? `The ${ctx.prev} ${ctx.model} is the adjacent older file, one model year back, with no gap in the list`
      : `This is the first ${ctx.model} year we publish, so there is no older file to compare it with`;
  const ageNote = ctx.age <= 1
    ? `A ${ctx.year} car is still in its first full year or so of the ${CURRENT_YEAR} market, which is when a new ${ctx.bodyLower} usually gives up the largest slice of its sticker price`
    : ctx.age <= 4
      ? `At ${ctx.age} years old in ${CURRENT_YEAR}, a ${ctx.year} ${ctx.model} is past the steepest early depreciation and still inside the window where many original 3-year/36,000-mile bumper-to-bumper terms have ended or are about to`
      : ctx.age <= 8
        ? `At ${ctx.age} years old in ${CURRENT_YEAR}, the original sale date on a ${ctx.year} ${ctx.model} is far enough back that a typical 5-year/60,000-mile powertrain term is expired or close to it, so any remaining coverage has to be read off the contract, not assumed`
        : `At ${ctx.age} years old in ${CURRENT_YEAR}, a ${ctx.year} ${ctx.model} is a used buy where condition, service history, and open recalls matter more than the original window sticker`;

  const blocks = [
    [
      `${neighborClause(ctx)}, which makes the ${ctx.year} ${ctx.make} ${ctx.model} the ${ctx.ordinalWord} of ${ctx.total} ${ctx.bodyLower} years we list for this nameplate, a line that starts in ${ctx.yearStart} and ${ctx.endPhrase}. ${ctx.clause ? ctx.clause + ", and that description is the one we keep for the whole run, not a guess about this single year." : "The catalog does not carry a separate model blurb, so the year list is the record."}`,
      `${vin}. Decoding the VIN is what fills in trim, engine, and plant for this exact ${ctx.year} ${ctx.model}. Those fields are not stored on the year page, because they change by vehicle, and NHTSA's VPIC decoder is the source we query. Position 9 is the check digit. If it fails, the VIN was mistyped or altered before you trust any spec that follows.`,
      `${peers}. Those are comparisons from the same catalog, matched on body style, not a ranking and not a price. ${gap}. Use the year links on this page to see how the ${ctx.model} list actually moves, including any holes, instead of assuming every calendar year was built.`,
      `Recall campaigns for the ${ctx.year} ${ctx.make} ${ctx.model} are not copied into this page as a count or a campaign number, because that list changes and it is specific to the VIN. Look the vehicle up in the NHTSA recall database, or use the recall checker on this site, which calls the same public feed. Under the National Traffic and Motor Vehicle Safety Act (49 U.S.C. Chapter 301), the safety remedy is free at a franchised ${ctx.make} dealer regardless of mileage. A recall is not the same thing as a lemon-law case. If the same defect keeps coming back, the federal Magnuson-Moss Warranty Act is the nationwide warranty statute, and the repair-attempt rules on top of it are set by the state, not by a single national number.`,
      `${ageNote}. ${ctx.make}, ${founded} in ${ctx.country}, is grouped here as a ${ctx.brand} brand, and insurers rate the ${ctx.year} ${ctx.model} from the decoded body, engine, and theft and repair costs, not from this page. State minimums differ. The state guides linked below show the liability floor. They are not a quote. For a sale, the FTC's advice is to learn what the car is worth and compare more than one offer. A dealer trade-in is credit toward another purchase, and an online offer is a sale, so one number is not a percentage better than the other by any rule we would print here.`,
    ],
    [
      `Catalog year ${ctx.ordinalWord} of ${ctx.total} for the ${ctx.make} ${ctx.model} is ${ctx.year}, a ${ctx.bodyLower} whose file runs from ${ctx.yearStart} and ${ctx.endPhrase}. ${neighborClause(ctx)}. ${ctx.clause ? "The nameplate note we rely on is this one: " + ctx.clause + "." : "There is no separate nameplate note in the catalog."}`,
      `What this page will not pretend to know is the trim, the engine, or an EPA figure for every ${ctx.year} ${ctx.model}, because those live on the VIN. ${vin}. Run the decoder above and you get the VPIC record for that one car, including trim when the manufacturer reported it. Pair it with a history report and a pre-purchase inspection when you are buying. The inspection steps live in the used-car checklist, so this year page does not repeat them as if they were unique to the ${ctx.model}.`,
      `${gap}. ${peers}. Read those peers as other ${ctx.bodyLower} records in the same file, each with its own start year, and then come back to the ${ctx.ordinalWord} ${ctx.model} year, which is the one you are actually considering.`,
      `Before you treat a ${ctx.year} ${ctx.make} ${ctx.model} as clear of safety recalls, check it by VIN. This catalog stores ${ctx.total} ${ctx.model} years and does not store NHTSA campaign IDs, on purpose. The recall checker and NHTSA's recalls-by-vehicle feed are the live sources, and a result there is for the make, model, and year, then narrowed by VIN at a dealer. The repair itself is free under 49 U.S.C. Chapter 301. Open recalls can be used as a bargaining point. They are not, by themselves, a ${ctx.make} lemon-law claim. State lemon-law guides on this site summarize the local statute and point you to the attorney general, because attempt counts and days out of service are not uniform.`,
      `${ageNote}. Insurance for a ${ctx.brand} ${ctx.bodyLower} from ${ctx.country} (${ctx.make}, ${founded}) moves with garaging ZIP code, driver record, and the equipment on the VIN, which is why a national average would be misleading on a ${ctx.year} ${ctx.model} page. If you are selling, compare a trade-in worksheet with at least one outright offer. The FTC's selling guidance is to shop the number. It does not publish a rule that online buyers beat dealers by a fixed percent, and neither do we.`,
    ],
    [
      `The ${ctx.year} ${ctx.make} ${ctx.model} record is a ${ctx.bodyLower}, ${ctx.ordinalWord} among ${ctx.total} years beginning in ${ctx.yearStart}; the line ${ctx.endPhrase}. ${neighborClause(ctx)}. ${ctx.clause ? "What the model record actually says, and the only description we attach to every year, is: " + ctx.clause + "." : ""}`,
      `${vin}, which is a useful sanity check when a listing says ${ctx.year} but the VIN's 10th character says otherwise. Trim, drive type, and engine for the ${ctx.ordinalWord} ${ctx.model} year come back from VPIC only after you decode a VIN. We do not keep a trim ladder on this page, because publishing one from memory would be fiction. The plant code in position 11 and the manufacturer identifier in the first three characters are the other fields worth reading if you are comparing two ${ctx.year} cars that look identical in photos.`,
      `${peers}. ${gap}. If you only have time for one comparison, put the ${ctx.year} ${ctx.model} next to the adjacent catalog year and next to one of those same-body peers, and notice which differences are in the catalog (body, span, brand) and which require a VIN (trim and equipment).`,
      `Safety recalls on a ${ctx.year} ${ctx.make} ${ctx.model} should be read from NHTSA, not from a paragraph that would go stale. Search by VIN, confirm the campaign number on the printout, and book the remedy at a ${ctx.make} dealer. Federal law makes that remedy free. It does not set your state's lemon-law arithmetic. Magnuson-Moss (15 U.S.C. §§ 2301–2312) is the warranty statute that applies in every state when a written warranty is not honored. Your state's own lemon law, linked from the state list on this page, is where repair-attempt counts live, and those counts need the attorney general's current text if you are about to rely on them.`,
      `${ageNote}. ${ctx.make} is a ${ctx.brand} marque ${founded} in ${ctx.country}, which is the brand context insurers and lenders already know. It is not a price. For the ${ctx.ordinalWord} ${ctx.model} year specifically, get the value from a guide using the decoded trim, then compare a dealer trade-in with a separate sale offer. Treat those as different deals. Anyone promising that one channel always pays a fixed share more is guessing, and this page will not guess with them.`,
    ],
  ];

  return blocks[v];
}

function yearBlurbs(ctx) {
  const v = ctx.variant;
  const insurance = [
    `Quotes for a ${ctx.year} ${ctx.make} ${ctx.model} (${ctx.ordinalWord} of ${ctx.total}, a ${ctx.brand} ${ctx.bodyLower}) depend on the decoded engine and your state minimum, which is why the quote tool asks for the VIN or the ZIP code rather than this page inventing a premium.`,
    `A ${ctx.year} ${ctx.model} insurance comparison is worth running because ${ctx.make} is rated as a ${ctx.brand} brand from ${ctx.country}, and the ${ctx.bodyLower} body style is only the start of the rating formula.`,
    `Use a quote form for the ${ctx.ordinalWord} ${ctx.model} year, ${ctx.year}, after you know the trim from the VIN. The state insurance guides list the liability floor. They are not a carrier's price.`,
  ];
  const warranty = [
    `Any service contract on a ${ctx.age}-year-old ${ctx.year} ${ctx.model} should be read against what is left of the original ${ctx.make} warranty, not against a generic list of covered parts. The warranty guide explains how to do that reading.`,
    `For catalog year ${ctx.ordinalWord} of the ${ctx.model} (${ctx.year}), ask what the contract excludes before you compare prices. A ${ctx.bodyLower} of this age is not automatically a good or bad candidate.`,
    `The ${ctx.year} ${ctx.make} ${ctx.model} may or may not still be inside a factory term, depending on the in-service date and mileage, neither of which is in our year file. Confirm both before you pay for extra coverage.`,
  ];
  const financing = [
    `A loan or refinance on a ${ctx.year} ${ctx.model} is priced off credit, term, and the vehicle's age (${ctx.age} years in ${CURRENT_YEAR}), not off a single APR printed for every ${ctx.make}.`,
    `Lenders will want the VIN for the ${ctx.ordinalWord} ${ctx.model} year so the ${ctx.year} collateral matches the contract. Pre-qualify with more than one source before you accept the dealership's first worksheet.`,
    `If you already have a note on a ${ctx.year} ${ctx.make} ${ctx.model}, a refinance quote is just a second price. It is not a promise that the rate falls, especially on a ${ctx.age}-year-old ${ctx.bodyLower}.`,
  ];
  const selling = [
    `Selling a ${ctx.year} ${ctx.make} ${ctx.model}: get the decoded trim first, then compare a trade-in credit with at least one outright offer. The FTC tells sellers to shop the value. It does not claim one channel wins by a set percent, and the ${ctx.ordinalWord} year of this nameplate is no exception.`,
    `An offer on this ${ctx.year} ${ctx.model} (${ctx.age} years old, catalog ${ctx.ordinalWord} of ${ctx.total}) should be compared with a second offer before you sign. A trade-in and a sale pay you in different ways.`,
    `For the ${ctx.year} ${ctx.bodyLower}, write down the VIN-decoded equipment before you talk to a buyer. Two ${ctx.make} ${ctx.model} listings from ${ctx.year} can be different cars, and the catalog year alone does not settle the price.`,
  ];
  return {
    insurance: insurance[v],
    warranty: warranty[v],
    financing: financing[v],
    selling: selling[v],
  };
}

function yearFaqs(ctx) {
  const code = ctx.vinCode ? ` For a ${ctx.year} vehicle the model-year code in position 10 is ${ctx.vinCode}.` : "";
  return [
    {
      q: `How do I decode a ${ctx.year} ${ctx.make} ${ctx.model} VIN?`,
      a: `Use the decoder on this page or the main VIN decoder. Both query NHTSA VPIC for the ${ctx.ordinalWord} ${ctx.model} year in a run of ${ctx.total} years that starts in ${ctx.yearStart}.${code} The VIN is on the dash, the driver's door jamb, the registration, or the insurance card.`,
    },
    {
      q: `Are there recalls on the ${ctx.year} ${ctx.make} ${ctx.model}?`,
      a: `This ${ctx.year} page does not store a campaign count for the ${ctx.model}, because NHTSA updates that list and the open items depend on the VIN. Check the recall checker, then have a ${ctx.make} dealer perform any safety remedy, which federal law makes free. The ${ctx.model} file here contains ${ctx.total} years, not recall IDs.`,
    },
    {
      q: `What should I check before buying a ${ctx.year} ${ctx.make} ${ctx.model}?`,
      a: `Confirm the VIN's 10th character matches a ${ctx.year} ${ctx.model} (catalog year ${ctx.ordinalWord} of ${ctx.total}, a ${ctx.bodyLower} from ${ctx.yearStart}), then read open recalls and a history report. The inspection routine itself is on the used-car checklist, shared across models so it is not reprinted as if it were unique to this ${ctx.make}.`,
    },
    {
      q: `How much is insurance on a ${ctx.year} ${ctx.make} ${ctx.model}?`,
      a: `No single premium belongs on this page. The ${ctx.year} ${ctx.model} is a ${ctx.brand} ${ctx.bodyLower} from ${ctx.country}, ${ctx.age} years old in ${CURRENT_YEAR}, and carriers price the decoded trim plus your record and ZIP code. State guides list the legal minimum, which is not the same as a quote.`,
    },
    {
      q: `What is left of the warranty on a ${ctx.year} ${ctx.make} ${ctx.model}?`,
      a: `The in-service date and mileage decide that, and neither is in the ${ctx.model} year file. A ${ctx.year} car is ${ctx.age} years old in ${CURRENT_YEAR}, so compare that age with the original ${ctx.make} term before you buy a service contract. The warranty guide walks through the paperwork. It does not assume a coverage list for this ${ctx.ordinalWord} catalog year.`,
    },
  ];
}

function yearCopy(entry) {
  const ctx = buildContext(entry);
  const tie = yearTie(ctx);
  const paragraphs = yearParagraphs(ctx).map((p) => seal(p, `This note is about ${tie}`));
  const rawBlurbs = yearBlurbs(ctx);
  const blurbs = {
    insurance: seal(rawBlurbs.insurance, `The quote is for ${tie}`),
    warranty: seal(rawBlurbs.warranty, `Read the contract against ${tie}`),
    financing: seal(rawBlurbs.financing, `The collateral is ${tie}`),
    selling: seal(rawBlurbs.selling, `Price ${tie}`),
  };
  const faqs = yearFaqs(ctx).map((f) => ({
    q: `${f.q.replace(/\?$/, "")} for ${tie}?`,
    a: seal(f.a, `That answer is for ${tie}`),
  }));
  const plain = [
    ...paragraphs,
    blurbs.insurance,
    blurbs.warranty,
    blurbs.financing,
    blurbs.selling,
    ...faqs.map((f) => `${f.q} ${f.a}`),
  ].join("\n");
  return {
    ctx: {
      ordinalWord: ctx.ordinalWord,
      total: ctx.total,
      age: ctx.age,
      vinCode: ctx.vinCode,
      yearStart: ctx.yearStart,
      yearEnd: ctx.yearEnd,
      country: ctx.country,
      founded: ctx.founded,
      brand: ctx.brand,
      prev: ctx.prev,
      next: ctx.next,
      gapBefore: ctx.gapBefore,
    },
    paragraphs,
    blurbs,
    faqs,
    faqSchema: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    plain,
  };
}

function modelContext(model) {
  const data = load();
  const key = `${model.makeSlug}/${model.slug}`;
  const make = data.makeBySlug.get(model.makeSlug);
  const years = data.yearsByKey.get(key) || [];
  const siblings = (data.modelsByMake.get(model.makeSlug) || []).filter((m) => m.slug !== model.slug);
  const body = bodyKey(model.bodyType);
  const peerPool = (data.modelsByBody.get(body) || []).filter(
    (m) => !(m.makeSlug === model.makeSlug && m.slug === model.slug)
  );
  const seed = hash(`model/${model.makeSlug}/${model.slug}`);
  const peers = [];
  if (peerPool.length) {
    for (let i = 0; peers.length < 3 && i < peerPool.length; i++) {
      peers.push(peerPool[(seed + i * 3) % peerPool.length]);
    }
  }
  const gaps = [];
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] > 1) gaps.push(`${years[i - 1]} to ${years[i]}`);
  }
  return {
    variant: seed % 3,
    model,
    make,
    years,
    siblings,
    peers,
    gaps,
    oldest: years[0],
    newest: years[years.length - 1],
    seed,
  };
}

function modelParagraphs(c) {
  const m = c.model;
  const make = c.make;
  const end = m.yearEnd ? `through ${m.yearEnd}` : "with no ending year on the record";
  const founded = make && make.founded ? `founded in ${make.founded}` : "without a founding year in the file";
  const country = make ? make.country : "an unlisted country";
  const brand = brandLabel(make ? make.type : "mainstream");
  const sib = c.siblings.length
    ? listNames(c.siblings.slice(0, 4).map((s) => `${s.name} (${s.bodyType.toLowerCase()}, ${s.yearStart}${s.yearEnd ? "–" + s.yearEnd : "–present"})`), 4)
    : "";
  const peers = c.peers.length ? listNames(c.peers.map(modelRef), 3) : "";
  const yearSpan = c.years.length
    ? `${c.years.length} model years from ${c.oldest} to ${c.newest}`
    : "no individual model years";
  const gapText = c.gaps.length
    ? `The year list is not continuous. It breaks between ${listNames(c.gaps, 4)}`
    : `The published years run without a hole from ${c.oldest} to ${c.newest}`;
  const v = c.variant;
  const blocks = [
    [
      `The ${m.makeName} ${m.name} file covers ${yearSpan}, a ${m.bodyType.toLowerCase()} that starts in ${m.yearStart} and ${end}. ${m.description} ${sib ? `Alongside it in the ${m.makeName} catalog: ${sib}.` : `It is the only ${m.makeName} model in this catalog.`}`,
      `${m.makeName}, ${founded} in ${country}, is listed as a ${brand} brand. That is the company context for every ${m.name} year we publish, from the ${c.oldest} car through the ${c.newest}. ${gapText}. Open a specific model year when you need the VIN year code, the neighboring years, and the ownership notes for that one file. This page stays at nameplate level on purpose.`,
      peers
        ? `Shoppers comparing body styles, not model years, can put the ${m.name} next to the ${peers}. Those peers are other ${bodyKey(m.bodyType)} records in the same catalog, with their own start years. They are not a scored ranking, and they do not share the ${m.name}'s ${c.years.length}-year span unless the dates happen to match.`
        : `The catalog does not have another ${m.bodyType.toLowerCase()} close enough to name as a peer for the ${m.name}, so the useful comparison is across ${m.makeName}'s own list and across the ${m.name} years themselves.`,
      `Recalls are a VIN question, not a property of the whole ${m.name} line. ${m.makeName} has ${c.years.length} ${m.name} years in this file, and none of them stores an NHTSA campaign ID. Use the recall checker or NHTSA's database, then schedule a safety remedy at a franchised dealer. That remedy is free under 49 U.S.C. Chapter 301. Lemon-law thresholds are state law, summarized in the state guides and worth confirming with the state attorney general before you rely on a number of repair attempts. Trim, engine, and plant for any single ${m.name} come from a VIN decode against NHTSA VPIC, which is why they are not printed as one spec line for ${yearSpan}.`,
      `Insurance, a service contract, and a selling price all need the model year and the decoded equipment. A ${c.oldest} ${m.name} and a ${c.newest} ${m.name} are different collateral. The FTC's guidance on selling a car is to compare offers. A trade-in credit and an outright purchase are different transactions, and this ${m.makeName} page does not claim that one beats the other by a fixed percentage. State insurance minimums are on the state pages linked below.`,
    ],
    [
      `${m.description} In our records that ${m.bodyType.toLowerCase()} runs ${yearSpan}, starting in ${m.yearStart} and it ${end}. ${gapText}. ${sib ? `The other ${m.makeName} models in the same file are ${sib}.` : ""}`,
      `Brand context for the whole line: ${m.makeName} was ${founded} in ${country} and is tagged ${brand}. Use that when you are reading an insurance or financing form that asks for the manufacturer, and use a specific year page when you are reading a listing. The ${c.oldest} through ${c.newest} links below are the only ${m.name} years we actually have, which matters if a seller claims a year that is not among them.`,
      peers
        ? `For a same-body comparison, the ${m.name}'s ${c.years.length} years sit near the ${peers}. Match the model year before you compare equipment, because a peer's start year is not ${m.yearStart} unless the dates say so.`
        : `There is not a second ${m.bodyType.toLowerCase()} in the catalog that makes a fair nameplate comparison, so stay inside the ${m.name} year list and the rest of the ${m.makeName} range.`,
      `Do not expect a recall tally for "all ${m.name}s." Campaigns are issued by year and often by build range, and the honest check is the VIN against NHTSA. The dealer repair for a safety recall is free. That federal rule is not a substitute for your state's lemon law, and the attempt counts in those statutes are not printed here as if they were identical in every state. Specs that vary inside ${m.yearStart}–${c.newest} — trim, engine, drive — belong to the VIN, not to this overview.`,
      `If you are pricing a ${m.makeName} ${m.name}, start from the year you actually have, between ${c.oldest} and ${c.newest}, and from the trim the VIN returns. Then compare more than one offer. Nothing in the ${c.years.length}-year file supports a blanket claim about trade-in versus online sale proceeds.`,
    ],
    [
      `Across ${yearSpan}, the ${m.makeName} ${m.name} is the ${m.bodyType.toLowerCase()} described in the catalog as follows. ${m.description} The span starts in ${m.yearStart} and ${end}. ${sib ? `Keep the ${sib} in view when you are browsing ${m.makeName}, because those are the sister models with their own year ranges.` : `No sister ${m.makeName} model is on file.`}`,
      `${gapText}. ${m.makeName} (${founded}, ${country}, ${brand}) is the manufacturer on every one of those ${c.years.length} records. Pick a year to see how that single file sits against its neighbors. The overview you are reading is not repeated there word for word. Each year page is built from its own position in this list.`,
      peers
        ? `Body-style peers pulled from the same dataset, for a reader who is choosing a ${bodyKey(m.bodyType)} rather than a specific ${m.name} year, include the ${peers}.`
        : `Peer shopping for this body style has to happen outside the catalog's ${m.bodyType.toLowerCase()} list, which does not offer another nameplate next to the ${m.name}.`,
      `A recall check still has to be done per VIN even after you have read all ${c.years.length} ${m.name} years. We do not freeze campaign numbers onto the nameplate. NHTSA does that work, the remedy is free, and lemon-law questions go to the state guide plus the attorney general because the federal Magnuson-Moss Act does not replace those state counts. Equipment questions go to the VIN decoder for the same reason: one ${m.name} year can contain more than one engine.`,
      `Selling or insuring "a ${m.name}" is too vague once the file covers ${c.oldest} through ${c.newest}. Narrow it to the year, decode the VIN, and compare offers. The FTC's selling article is the right standard. A made-up gap between trade-in and online offers is not.`,
    ],
  ];
  return blocks[v].map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function modelBlurbs(c) {
  const m = c.model;
  const v = c.variant;
  const insurance = [
    `Comparing insurance for a ${m.makeName} ${m.name} only gets specific once you pick a year between ${c.oldest} and ${c.newest} and a ZIP code. The nameplate's ${c.years.length} years are not one rate.`,
    `The ${m.name} is a ${m.bodyType.toLowerCase()} with ${c.years.length} filed years. Carriers do not price that whole span as a single car.`,
    `Start an insurance quote with the model year you mean. The ${m.makeName} ${m.name} record runs ${c.oldest}–${c.newest}, and the state minimum is a floor, not a premium.`,
  ];
  const warranty = [
    `A service contract on a ${m.name} has to say which of the ${c.years.length} model years it covers. Read the exclusions against the warranty guide before you compare prices.`,
    `Factory coverage on a ${m.makeName} ${m.name} depends on the in-service date of that one car, somewhere in the ${c.oldest}–${c.newest} range. The overview cannot tell you what is left.`,
    `If the ${m.name} you have is an early year near ${c.oldest}, assume nothing about powertrain coverage until you see the contract. Later years near ${c.newest} need the same check.`,
  ];
  const financing = [
    `Financing a ${m.makeName} ${m.name} is a loan on one model year, not on the ${c.years.length}-year nameplate. Newer collateral near ${c.newest} and older collateral near ${c.oldest} are underwritten differently.`,
    `Get more than one pre-qualification if you are borrowing for a ${m.name}. The catalog span (${c.oldest}–${c.newest}) is not an interest rate.`,
    `A refinance quote for an existing ${m.name} note should be compared with the APR you already pay. The ${m.bodyType.toLowerCase()} body style does not, by itself, lower the rate.`,
  ];
  const selling = [
    `To price a ${m.makeName} ${m.name}, narrow the ${c.oldest}–${c.newest} span to your year and trim, then compare a trade-in with a separate sale. No fixed percent separates those offers in any source we are willing to cite.`,
    `Buyers of a ${m.name} will ask which of the ${c.years.length} years you have. Answer with the VIN decode, then collect more than one offer, which is the FTC's actual advice.`,
    `A ${c.oldest} ${m.name} and a ${c.newest} ${m.name} should not share a asking price just because they share this page. Compare offers on the car you have.`,
  ];
  return {
    insurance: insurance[v],
    warranty: warranty[v],
    financing: financing[v],
    selling: selling[v],
  };
}

function modelFaqs(c) {
  const m = c.model;
  const end = m.yearEnd ? String(m.yearEnd) : "the present";
  return [
    {
      q: `How do I decode a ${m.makeName} ${m.name} VIN?`,
      a: `Enter the 17-character VIN in the decoder on this page. NHTSA VPIC returns the model year, trim, and plant for that one ${m.name}. The nameplate file covers ${c.years.length} years from ${c.oldest} to ${c.newest}, and the decode tells you which of those years you actually have.`,
    },
    {
      q: `Does the ${m.makeName} ${m.name} have any recalls?`,
      a: `Some ${m.name} years do and some do not, and the campaign list is NHTSA's, not a number stored against all ${c.years.length} years. Check the specific VIN. Any safety remedy is free at a ${m.makeName} dealer under 49 U.S.C. Chapter 301.`,
    },
    {
      q: `What years was the ${m.makeName} ${m.name} produced?`,
      a: `Our catalog lists the ${m.name} from ${m.yearStart} through ${end}, with ${c.years.length} model-year pages from ${c.oldest} to ${c.newest}. ${c.gaps.length ? `The list breaks between ${listNames(c.gaps, 3)}.` : `Those pages run without a gap.`}`,
    },
    {
      q: `Is a ${m.makeName} ${m.name} VIN lookup free?`,
      a: `Yes. The decoder on this ${m.name} page uses NHTSA VPIC and does not require an account. It covers the ${c.years.length} filed years, and it does not replace a paid history report for accidents or title brands.`,
    },
  ];
}

function modelCopy(model) {
  const c = modelContext(model);
  const tie = modelTie(c);
  const paragraphs = modelParagraphs(c).map((p) => seal(p, `This overview is ${tie}`));
  const rawBlurbs = modelBlurbs(c);
  const blurbs = {
    insurance: seal(rawBlurbs.insurance, `Compare coverage for ${tie}`),
    warranty: seal(rawBlurbs.warranty, `Match any contract to ${tie}`),
    financing: seal(rawBlurbs.financing, `Underwrite ${tie}`),
    selling: seal(rawBlurbs.selling, `Price ${tie}`),
  };
  const faqs = modelFaqs(c).map((f) => ({
    q: `${f.q.replace(/\?$/, "")} for ${tie}?`,
    a: seal(f.a, `That answer is for ${tie}`),
  }));
  const plain = [
    ...paragraphs,
    blurbs.insurance,
    blurbs.warranty,
    blurbs.financing,
    blurbs.selling,
    ...faqs.map((f) => `${f.q} ${f.a}`),
  ].join("\n");
  return {
    paragraphs,
    blurbs,
    faqs,
    faqSchema: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    plain,
    stats: {
      count: c.years.length,
      oldest: c.oldest,
      newest: c.newest,
      gaps: c.gaps,
    },
  };
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
  iterPages,
  vinYearCode,
  load,
};
