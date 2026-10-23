"use strict";

const { articleFor, fixArticles } = require("./article");

/**
 * Ownership copy for one make, model, or model year in one state.
 * Each fact is its own sentence. State statutes, fees, and inspection
 * rules are the published text, so the same sentences recur across a
 * state. Nothing is appended to make a sentence unique.
 */

const EV_MAKES = {
  tesla: true,
  rivian: true,
  lucid: true,
  polestar: true,
  fisker: true,
};

const EV_MODELS = {
  "hyundai/ioniq 5": true,
  "kia/ev6": true,
  "volkswagen/id.4": true,
  "cadillac/lyriq": true,
  "volvo/c40": true,
  "audi/e-tron": true,
  "gmc/hummer ev": true,
  "porsche/taycan": true,
  "genesis/gv60": true,
  "maybach/eqs maybach": true,
  "lotus/evija": true,
};

function money(n) {
  const num = Number(n);
  if (!(num > 1)) return null;
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function who(p) {
  const parts = [];
  if (p.year) parts.push(String(p.year));
  if (p.make) parts.push(p.make);
  if (p.model) parts.push(p.model);
  return parts.join(" ");
}

function named(p) {
  const name = who(p);
  const first = name.split(" ")[0];
  return articleFor(first) + " " + name;
}

function sentence(text) {
  let s = fixArticles(String(text || "").replace(/\s+/g, " ").trim());
  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += ".";
  return s;
}

function dedupe(lines) {
  const out = [];
  const seen = new Set();
  lines.forEach(function (line) {
    const key = String(line || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(line);
  });
  return out;
}

function splitSentences(text) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  s = s.replace(/\b((?:[A-Z][a-z]{0,3}|[A-Z]{1,4}|tit|ch|sec))\.\s+/g, "$1.\u0001");
  const parts = s.split(/(?<=[.?!])\s+/);
  const out = [];
  parts.forEach(function (part) {
    part.replace(/\u0001/g, " ").split(/;\s+/).forEach(function (clause) {
      const line = sentence(clause);
      if (line) out.push(line);
    });
  });
  return out;
}

function statuteTokens(citation) {
  const text = String(citation || "");
  const found = [];
  const re = /[0-9]+(?:[./-][0-9A-Za-z]+)+(?:\([0-9A-Za-z]+\))?|§§?\s*([0-9A-Za-z][0-9A-Za-z./()-]*)/g;
  let match;
  while ((match = re.exec(text))) found.push(match[1] || match[0]);
  return found.filter(function (token, index) { return token && found.indexOf(token) === index; });
}

function feePhrase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^included in registration$/i.test(raw)) return "included in the registration fee";
  if (/^\$/.test(raw) || /^[0-9]/.test(raw)) return raw;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function isElectric(p) {
  const make = String(p.make || "").toLowerCase();
  const model = String(p.model || "").toLowerCase();
  if (EV_MAKES[make]) return true;
  return !!EV_MODELS[make + "/" + model];
}

function neighbors(p) {
  const years = Array.isArray(p.years) ? p.years : [];
  const idx = p.year ? years.indexOf(Number(p.year)) : -1;
  return {
    prevYear: idx > 0 ? years[idx - 1] : null,
    nextYear: idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null,
  };
}

function mpgRange(min, max) {
  if (min == null) return "";
  if (max == null || Number(max) === Number(min)) return String(min);
  return min + "–" + max;
}

function dollarMinimum(detail) {
  const parts = String(detail || "").split(/\s+\/\s+/).map(function (part) { return part.trim(); }).filter(Boolean);
  if (parts.length < 2) return String(detail || "").trim();
  if (parts.length === 2) return parts[0] + " and " + parts[1];
  return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
}

function insuranceLines(p) {
  const lines = [sentence("The liability minimum is " + p.minimum)];
  const detail = String(p.minimumDetail || "").trim();
  if (detail) {
    const parts = detail.split(/(?<=[.?!])\s+/);
    const dollars = dollarMinimum(parts[0]).replace(/[.?!]+$/g, "");
    if (dollars) lines.push(sentence("In dollars, that minimum is " + dollars));
    splitSentences(parts.slice(1).join(" ")).forEach(function (line) { lines.push(line); });
  }
  const avg = money(p.avgCost);
  if (avg) {
    lines.push(sentence(
      "The statewide all-vehicle average premium in " + p.stateName + " is " + avg +
      ", the 2024 combined average for liability, collision, and comprehensive in Table 5 of the NAIC Auto Insurance Database Average Premium Supplement"
    ));
  }
  return dedupe(lines);
}

function insuranceLead(p) {
  return insuranceLines(p).join(" ");
}

function restatesListedFee(line, p) {
  const norm = String(line || "").toLowerCase().replace(/\.$/, "").trim();
  const fields = [
    ["title fee", p.titleFee],
    ["registration fee", p.registrationFee],
    ["plate fee", p.plateFee],
  ];
  return fields.some(function (pair) {
    if (!pair[1] || /^included in registration$/i.test(String(pair[1]).trim())) return false;
    const fee = feePhrase(pair[1]).toLowerCase();
    return norm === pair[0] + " is " + fee
      || norm === "the " + pair[0] + " is " + fee
      || norm === pair[0] + "s are " + fee
      || norm === "the " + pair[0] + "s are " + fee;
  });
}

function moneyLike(value) {
  const raw = String(value || "").trim();
  return /^\$/.test(raw) || /^[0-9]/.test(raw);
}

function pushFee(lines, p, label, value, namedAlready) {
  if (!value) return namedAlready;
  const phrase = feePhrase(value);
  if (!namedAlready && who(p) && p.stateName) {
    const charge = moneyLike(value)
      ? "is charged a " + label + " of " + phrase
      : "has a " + label + " " + phrase;
    lines.push(sentence(named(p) + " in " + p.stateName + " " + charge));
    return true;
  }
  lines.push(sentence("The " + label + " is " + phrase));
  return namedAlready;
}

function registrationLines(p) {
  const lines = [];
  let namedAlready = false;
  if (!(isElectric(p) && p.evFeeReplaces)) {
    namedAlready = pushFee(lines, p, "registration fee", p.registrationFee, namedAlready);
  }
  namedAlready = pushFee(lines, p, "title fee", p.titleFee, namedAlready);
  if (p.plateFee) {
    if (/^included in registration$/i.test(String(p.plateFee).trim())) {
      lines.push(sentence("Plates are included in the registration fee"));
    } else {
      pushFee(lines, p, "plate fee", p.plateFee, namedAlready);
    }
  }
  splitSentences(p.registrationNotes).forEach(function (line) {
    if (!restatesListedFee(line, p)) lines.push(line);
  });
  if (p.safetyDetail) splitSentences(p.safetyDetail).forEach(function (line) { lines.push(line); });
  else if (p.hasSafetyInspection) lines.push(sentence(p.stateName + " requires a safety inspection"));
  if (p.emissionsDetail) splitSentences(p.emissionsDetail).forEach(function (line) { lines.push(line); });
  else if (p.hasEmissions) lines.push(sentence(p.stateName + " lists an emissions program for gasoline vehicles"));
  if (isElectric(p) && (p.emissionsDetail || p.hasEmissions)) {
    const exact = "A vehicle operated only on electricity does not take the emissions test.";
    if (!lines.some(function (line) { return /does not take the emissions test/i.test(line); })) lines.push(exact);
  }
  if (isElectric(p)) splitSentences(p.evRegistration).forEach(function (line) { lines.push(line); });
  return dedupe(lines);
}

function registrationLead(p) {
  return registrationLines(p).join(" ");
}

function missingCitationLines(summary, citation) {
  const lines = [];
  String(citation || "").split(/;\s+/).forEach(function (chunk) {
    const clean = chunk.replace(/[.?!]+$/g, "").trim();
    if (!clean) return;
    const tokens = statuteTokens(clean);
    const missing = tokens.filter(function (token) { return summary.indexOf(token) === -1; });
    if (tokens.length && !missing.length) return;
    if (!tokens.length && summary.indexOf(clean) !== -1) return;
    if (tokens.length && missing.length < tokens.length) {
      lines.push(sentence("The statute also cites " + missing.join(" and ")));
      return;
    }
    lines.push(sentence("The statute is " + clean));
  });
  return lines;
}

function lemonLines(p) {
  const summary = String(p.lemonSummary || "");
  let lines = splitSentences(summary);
  if (!lines.length) {
    lines = [
      sentence("No state lemon-law presumption is published here"),
      sentence("The federal statute that still applies is the Magnuson-Moss Warranty Act, 15 U.S.C. sections 2301 through 2312"),
    ];
  }
  if (p.hasLemonLaw && p.citation) {
    missingCitationLines(summary, p.citation).forEach(function (line) { lines.push(line); });
  }
  return dedupe(lines);
}

function lemonLead(p) {
  return lemonLines(p).join(" ");
}

function incentiveLines(p) {
  const lines = [
    sentence("Federal clean-vehicle credits are not available for a vehicle acquired after September 30, 2025"),
  ];
  splitSentences(p.evDetail).forEach(function (line) { lines.push(line); });
  return dedupe(lines);
}

function incentiveLine(p) {
  return incentiveLines(p).join(" ");
}

function ask(text) {
  return sentence(text).replace(/\.$/, "?");
}

function feeBit(label, value) {
  const phrase = feePhrase(value);
  if (moneyLike(value)) return "a " + label + " of " + phrase;
  return "a " + label + " " + phrase;
}

function feeAnswer(p) {
  const bits = [];
  if (p.registrationFee && !(isElectric(p) && p.evFeeReplaces)) bits.push(feeBit("registration fee", p.registrationFee));
  if (p.titleFee) bits.push(feeBit("title fee", p.titleFee));
  if (p.plateFee) {
    if (/^included in registration$/i.test(String(p.plateFee).trim())) bits.push("plates included in the registration fee");
    else bits.push(feeBit("plate fee", p.plateFee));
  }
  if (!bits.length) return "";
  const joined = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(", ") + ", and " + bits[bits.length - 1];
  return sentence((bits.length === 1 ? "The published fee is " : "The published fees are ") + joined);
}

function geoFaqs(p) {
  const faqs = [];
  const firstDetail = String(p.minimumDetail || "").split(/(?<=[.?!])\s+/)[0] || "";
  const dollars = dollarMinimum(firstDetail).replace(/[.?!]+$/g, "");
  faqs.push({
    q: ask("What liability minimum applies"),
    a: sentence(dollars
      ? "The liability minimum is " + p.minimum + ", or " + dollars
      : "The liability minimum is " + p.minimum),
  });
  const fees = feeAnswer(p);
  if (fees) {
    faqs.push({
      q: ask("Which registration fees are published"),
      a: fees,
    });
  }
  return faqs;
}

function carLabel(p) {
  if (!p.stateName) return who(p);
  if (!p.year && p.fact && p.fact.factYear) return "the " + p.fact.factYear + " model year";
  if (p.year) return "this model year";
  return "this model";
}

function factSentences(p) {
  const fact = p && p.fact;
  if (!fact) return [];
  const car = carLabel(p);
  const lines = [];
  if (fact.combMin) {
    const count = fact.epaConfigs || 1;
    if (count === 1) {
      const bits = [];
      if (fact.epaName) bits.push(fact.epaName);
      if (fact.displ) bits.push(fact.displ + "L");
      if (fact.cylinders) bits.push(fact.cylinders + "-cylinder");
      if (fact.drive) bits.push(fact.drive);
      if (fact.trans) bits.push(fact.trans);
      const label = bits.length ? " (" + bits.join(", ") + ")" : "";
      lines.push(sentence("On October 23, 2026, fueleconomy.gov listed one configuration of " + car + label));
      lines.push(sentence("Combined mileage is " + fact.combMin + " mpg"));
      if (fact.cityMin != null) lines.push(sentence("City mileage is " + fact.cityMin + " mpg"));
      if (fact.hwyMin != null) lines.push(sentence("Highway mileage is " + fact.hwyMin + " mpg"));
    } else {
      const low = fact.epaLow && fact.epaLow !== fact.epaHigh ? " on the " + fact.epaLow : "";
      const high = fact.epaHigh && fact.epaHigh !== fact.epaLow ? " on the " + fact.epaHigh : "";
      const counted = !p.stateName && fact.factYear ? "the " + fact.factYear + " " + car : car;
      lines.push(sentence("On October 23, 2026, fueleconomy.gov listed " + count + " configurations of " + counted));
      lines.push(sentence("Combined mileage runs from " + fact.combMin + " mpg" + low + " to " + fact.combMax + " mpg" + high));
      lines.push(sentence("City mileage is " + mpgRange(fact.cityMin, fact.cityMax) + " mpg"));
      lines.push(sentence("Highway mileage is " + mpgRange(fact.hwyMin, fact.hwyMax) + " mpg"));
    }
  }
  if (fact.recalls != null) {
    const word = Number(fact.recalls) === 1 ? "campaign" : "campaigns";
    lines.push(sentence("NHTSA recalls-by-vehicle listed " + fact.recalls + " " + word + " for " + car + " on October 23, 2026"));
  }
  if (Number(fact.complaints) > 0) {
    const named = [p.year, p.make, p.model].filter(Boolean).join(" ") || car;
    lines.push(sentence("NHTSA had received " + fact.complaints + " owner complaints for the " + named + " as of October 23, 2026"));
  }
  if (fact.starsMin) {
    const stars = fact.starsMax && fact.starsMax !== fact.starsMin
      ? fact.starsMin + " to " + fact.starsMax
      : String(fact.starsMin);
    lines.push(sentence("Tested vehicles earned " + stars + " stars overall"));
  }
  return lines;
}

function recordedLines(p) {
  const lines = factSentences(p).slice();
  if (!lines.length) {
    if (p.year || p.model) lines.push(sentence("No fueleconomy.gov configuration or NHTSA recall, complaint, or star rating is stored for this model year"));
    return lines;
  }
  const near = neighbors(p);
  if (p.year && near.prevYear && near.nextYear) lines.push(sentence("The neighboring model years on file are " + near.prevYear + " and " + near.nextYear));
  else if (p.year && near.nextYear) lines.push(sentence("The later model year on file is " + near.nextYear));
  else if (p.year && near.prevYear) lines.push(sentence("The prior model year on file is " + near.prevYear));
  return lines;
}

function faqHtml(faqs) {
  const items = faqs.map(function (faq) {
    return '<div class="faq-item"><h3>' + escapeHtml(faq.q) + "</h3><p>" + escapeHtml(faq.a) + "</p></div>";
  }).join("");
  return '<section class="glass-card metallic-border rounded-2xl overflow-hidden carbon-panel mb-8"><div class="steel-header px-6 py-4"><h2 class="font-bold text-white text-lg">Questions</h2></div><div class="px-6 py-5 space-y-4">' + items + "</div></section>";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function faqSchemaScript(faqs) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(function (faq) {
      return {
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      };
    }),
  };
  return '<script type="application/ld+json">' + JSON.stringify(schema) + "</script>";
}

module.exports = {
  insuranceLines,
  insuranceLead,
  registrationLines,
  registrationLead,
  lemonLines,
  lemonLead,
  incentiveLines,
  incentiveLine,
  geoFaqs,
  factSentences,
  recordedLines,
  isElectric,
  statuteTokens,
  faqHtml,
  faqSchemaScript,
};
