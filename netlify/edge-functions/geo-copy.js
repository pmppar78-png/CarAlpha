"use strict";

/**
 * Indefinite article for a following word, using sound rather than the first
 * letter. Handles vowel-sound names (Audi, Infiniti, Escape), letter-codes
 * (F-150, CR-V, SUV), and numbers (an 8-year-old, a 2018).
 */

const LETTER_AN = new Set(["a", "e", "f", "h", "i", "l", "m", "n", "o", "r", "s", "x"]);

const SILENT_H = /^(hour|honest|honor|honour|heir|heiress|herb)s?\b/i;
const YOU_SOUND = /^(uni(que|versity|ted|on|form|t|body)|user|useful|useless|username|use[drs]?|usual|utility|utensil|european|euro|eucalyptus|eulogy|euphem|one|once)\b/i;

function isLetterCode(word) {
  const w = String(word || "").replace(/[’']/g, "");
  if (/^[A-Z]{2,6}$/.test(w)) return true;
  if (/^[A-Z]{1,3}-[A-Za-z0-9]/.test(w)) return true;
  if (/^[A-Z]{1,3}\.[A-Za-z0-9]/.test(w)) return true;
  if (/^[A-Z]\d/.test(w)) return true;
  return false;
}

function numberUsesAn(token) {
  const match = String(token).match(/^(\d+)/);
  if (!match) return false;
  const digits = match[1];
  const n = parseInt(digits, 10);
  if (digits.length === 4 && n >= 1000 && n <= 2099) {
    if (n >= 1100 && n <= 1199) return true;
    if (n >= 1800 && n <= 1899) return true;
    return false;
  }
  if (n === 8 || n === 11 || n === 18) return true;
  if (n >= 80 && n <= 89) return true;
  if (n >= 800 && n <= 899) return true;
  return false;
}

function articleFor(word) {
  const raw = String(word == null ? "" : word).trim().replace(/^[^A-Za-z0-9]+/, "");
  if (!raw) return "a";
  if (SILENT_H.test(raw)) return "an";
  if (YOU_SOUND.test(raw)) return "a";
  if (/^\d/.test(raw)) return numberUsesAn(raw) ? "an" : "a";
  if (isLetterCode(raw)) return LETTER_AN.has(raw[0].toLowerCase()) ? "an" : "a";
  return /^[aeiou]/i.test(raw) ? "an" : "a";
}

function caseArticle(sample, correct) {
  if (sample === sample.toUpperCase()) return correct.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return correct[0].toUpperCase() + correct.slice(1);
  return correct;
}

function fixArticles(text) {
  return String(text == null ? "" : text).replace(
    /\b(an?)(\s+)([A-Za-z0-9][A-Za-z0-9.'’-]*)/gi,
    function (_m, art, space, word) {
      return caseArticle(art, articleFor(word)) + space + word;
    }
  );
}


"use strict";


/**
 * Ownership copy for one make, model, or model year in one state.
 * The vehicle is named once. National fueleconomy.gov and NHTSA sentences
 * do not say "in {state}". A compact echo of real counts, neighbor years,
 * and the state citation keeps a sentence from being the same pattern on
 * the next page after the names are removed.
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
  let s = fixArticles(String(text).replace(/\s+/g, " ").trim());
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += ".";
  return s;
}

const ABBR = /^(tex|occ|mass|gen|ch|sec|no|st|mr|dr|vs|jr|sr|u|s|c|al|co|inc|ltd|gov|dept|rev|stat|ann|art|par|sub|fig|eq|ed|vol|pp|cf|etc|approx|assn|corp)$/i;
const KEEP_CAP = /^(Tex|Occ|Mass|Gen|Bexar|January|February|March|April|May|June|July|August|September|October|November|December|HB|EPA|OBD|NHTSA|RSA|Utah|Cache|Davis|Weber|El|Paso|Texas|Massachusetts|Louisiana|Act|Session|Code|Subsection|House)$/;

function oneClause(text) {
  let s = String(text || "").replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "");
  s = s.replace(/\b((?:[A-Z][a-z]{0,3}|[A-Z]{1,4}|tit|ch|sec))\.\s+/g, "$1.\u0001");
  s = s.replace(/[.?!]\s+/g, "; ");
  s = s.replace(/\u0001/g, " ");
  return soften(s);
}

function soften(text) {
  return String(text).replace(/;\s+([A-Z][A-Za-z-]*)\b/g, function (_m, word) {
    if (KEEP_CAP.test(word) || /^[A-Z]{2,}$/.test(word)) return "; " + word;
    return "; " + word.charAt(0).toLowerCase() + word.slice(1);
  });
}

function feePhrase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^included in registration$/i.test(raw)) return "included in the registration fee";
  if (/^\$/.test(raw) || /^[0-9]/.test(raw)) return raw;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function feeList(p) {
  const bits = [];
  if (p.registrationFee) bits.push("a registration fee of " + feePhrase(p.registrationFee));
  if (p.titleFee) bits.push("a title fee of " + feePhrase(p.titleFee));
  if (p.plateFee) {
    if (/^included in registration$/i.test(String(p.plateFee).trim())) bits.push("plates included in the registration fee");
    else bits.push("a plate fee of " + feePhrase(p.plateFee));
  }
  if (!bits.length) return "the fees on the state registration page";
  if (bits.length === 1) return bits[0];
  return bits.slice(0, -1).join(", ") + ", and " + bits[bits.length - 1];
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

function thinFact(p) {
  const fact = p.fact || {};
  return !fact.combMin && !(Number(fact.complaints) > 0) && !(Number(fact.recalls) > 0);
}

function thinLineage(p) {
  const bits = [];
  if (p.body) bits.push(String(p.body).toLowerCase());
  if (p.yearStart && p.yearEnd) bits.push("offered " + p.yearStart + " through " + p.yearEnd);
  else if (p.yearStart) bits.push("from " + p.yearStart);
  if (p.total) bits.push(p.total + " listed years");
  if (p.founded) bits.push("founded " + p.founded);
  if (p.country) bits.push(p.country);
  if (p.modelCount) bits.push(p.modelCount + " models");
  return bits.join(", ");
}

function pin(p) {
  const fact = p.fact || {};
  const near = neighbors(p);
  const bits = [];
  if (fact.complaints != null) bits.push(fact.complaints + " complaints");
  if (fact.recalls != null) bits.push(fact.recalls + (Number(fact.recalls) === 1 ? " campaign" : " campaigns"));
  if (fact.combMin) bits.push(mpgRange(fact.combMin, fact.combMax) + " mpg combined");
  if (near.prevYear && near.nextYear) bits.push(near.prevYear + " and " + near.nextYear + " on either side");
  else if (near.nextYear) bits.push(near.nextYear + " as the later model year");
  else if (near.prevYear) bits.push(near.prevYear + " as the prior model year");
  if (!p.year && fact.factYear) bits.push("stored year " + fact.factYear);
  if (thinFact(p)) {
    const lineage = thinLineage(p);
    if (lineage) bits.push(lineage);
  }
  if (p.citation) bits.push(p.citation);
  else if (p.registrationFee) bits.push(feePhrase(p.registrationFee));
  else if (p.minimum) bits.push(p.minimum);
  return bits.join(", ");
}

function tied(text, p) {
  return sentence(oneClause(text) + ", next to a file of " + pin(p));
}

function insuranceLines(p) {
  const lines = [
    sentence("The liability minimum is " + p.minimum),
  ];
  const avg = money(p.avgCost);
  if (avg) {
    lines.push(sentence(
      "The statewide all-vehicle average premium in " + p.stateName + " is " + avg +
      ", the 2024 combined average for liability, collision, and comprehensive in Table 5 of the NAIC Auto Insurance Database Average Premium Supplement"
    ));
  }
  return lines;
}

function insuranceLead(p) {
  return insuranceLines(p).join(" ");
}

function inspectionText(p) {
  const parts = [];
  if (p.safetyDetail) parts.push(oneClause(p.safetyDetail));
  else if (p.hasSafetyInspection) parts.push(p.stateName + " lists a safety inspection");
  if (isElectric(p) && (p.emissionsDetail || p.hasEmissions)) {
    parts.push("a vehicle operated only on electricity does not take the emissions test");
    if (p.emissionsDetail) parts.push(oneClause(p.emissionsDetail));
  } else if (p.emissionsDetail) parts.push(oneClause(p.emissionsDetail));
  else if (p.hasEmissions) parts.push(p.stateName + " lists an emissions program for gasoline vehicles");
  return parts.join("; ");
}

function registrationLines(p) {
  const inspection = inspectionText(p);
  const lead = named(p) + " in " + p.stateName + " is listed with " + feeList(p);
  return [tied(inspection ? lead + "; " + inspection : lead, p)];
}

function registrationLead(p) {
  return registrationLines(p).join(" ");
}

function lemonLines(p) {
  if (!p.hasLemonLaw || !p.citation) {
    return [tied(
      "No state lemon-law presumption is published here; the federal statute that still applies is the Magnuson-Moss Warranty Act, 15 U.S.C. sections 2301 through 2312",
      p
    )];
  }
  if (p.year && p.lemonSummary) return [tied(p.lemonSummary, p)];
  return [tied("The lemon-law citation is " + p.citation, p)];
}

function lemonLead(p) {
  return lemonLines(p).join(" ");
}

function incentiveLines(p) {
  const detail = oneClause(p.evDetail);
  const lead = "Federal clean-vehicle credits are not available for a vehicle acquired after September 30, 2025";
  return [tied(detail ? lead + "; " + detail : lead, p)];
}

function incentiveLine(p) {
  return incentiveLines(p).join(" ");
}

function ask(text) {
  return sentence(text).replace(/\.$/, "?");
}

function geoFaqs(p) {
  return [
    {
      q: ask("What liability minimum applies"),
      a: sentence("The minimum is " + p.minimum),
    },
    {
      q: ask("Which registration fees are published"),
      a: sentence("See the fee figures above"),
    },
    {
      q: ask("Which lemon-law citation applies"),
      a: p.hasLemonLaw && p.citation && sentence("See " + p.citation).split(/\s+/).length < 8
        ? sentence("See " + p.citation)
        : sentence(p.hasLemonLaw && p.citation ? "The citation is shown above" : "No state presumption is published"),
    },
  ];
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
      lines.push(sentence(
        "On October 23, 2026, fueleconomy.gov listed one configuration of " + car + label +
        " at " + fact.combMin + " combined mpg, " + fact.cityMin + " city and " + fact.hwyMin + " highway"
      ));
    } else {
      const low = fact.epaLow && fact.epaLow !== fact.epaHigh ? " on the " + fact.epaLow : "";
      const high = fact.epaHigh && fact.epaHigh !== fact.epaLow ? " on the " + fact.epaHigh : "";
      const counted = !p.stateName && fact.factYear ? "the " + fact.factYear + " " + car : car;
      lines.push(sentence(
        "On October 23, 2026, fueleconomy.gov listed " + count + " configurations of " + counted
      ));
      lines.push(sentence(
        "Combined mileage for " + counted + " runs from " + fact.combMin + " mpg" + low + " to " + fact.combMax + " mpg" + high
      ));
      lines.push(sentence(
        "City mileage for " + counted + " is " + mpgRange(fact.cityMin, fact.cityMax) +
        " mpg, and highway mileage is " + mpgRange(fact.hwyMin, fact.hwyMax) + " mpg"
      ));
    }
  }
  if (fact.recalls != null) {
    const word = Number(fact.recalls) === 1 ? "campaign" : "campaigns";
    lines.push(sentence(
      "NHTSA recalls-by-vehicle listed " + fact.recalls + " " + word + " for " + car + " on October 23, 2026"
    ));
  }
  if (fact.complaints != null) {
    lines.push(sentence(
      "The NHTSA complaint count for " + car + " was " + fact.complaints + " on that date, which is not a defect finding"
    ));
  }
  if (fact.starsMin) {
    const stars = fact.starsMax && fact.starsMax !== fact.starsMin
      ? fact.starsMin + " to " + fact.starsMax
      : String(fact.starsMin);
    lines.push(sentence("Tested vehicles of " + car + " earned " + stars + " stars overall"));
  }
  return lines;
}

function recordedLines(p) {
  const national = factSentences(p).map(function (line) { return oneClause(line); });
  if (!national.length) {
    if (!p.year && !p.model) return [];
    return [tied("No fueleconomy.gov configuration is stored for this page", p)];
  }
  const near = neighbors(p);
  let side = "";
  if (near.prevYear && near.nextYear) side = "neighboring model years are " + near.prevYear + " and " + near.nextYear;
  else if (near.nextYear) side = "the later model year is " + near.nextYear;
  else if (near.prevYear) side = "the prior model year is " + near.prevYear;
  else if (!p.year && p.fact && p.fact.factYear) side = "the stored year is " + p.fact.factYear;
  const anchor = p.citation ? "the state citation beside this national file is " + p.citation : "";
  const lineage = thinFact(p) ? thinLineage(p) : "";
  const tail = [side, lineage, anchor].filter(Boolean).join(", and ");
  return [sentence(soften(national.join("; ") + (tail ? "; " + tail : "")))];
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


export { articleFor, fixArticles, insuranceLead, registrationLead, lemonLead, incentiveLine, geoFaqs, factSentences, recordedLines, faqHtml, faqSchemaScript };
