"use strict";

/**
 * Indefinite article for a following word, using sound rather than the first
 * letter. Handles vowel-sound names (Audi, Infiniti, Escape), letter-codes
 * (F-150, CR-V, SUV), and numbers (an 8-year-old, a 2018).
 */

const LETTER_AN = new Set(["a", "e", "f", "h", "i", "l", "m", "n", "o", "r", "s", "x"]);

const SILENT_H = /^(hour|honest|honor|honour|heir|heiress|herb)s?\b/i;
const YOU_SOUND = /^(uni(que|versity|ted|on|form|t)|user|useful|useless|username|use[drs]?|usual|utility|utensil|european|euro|eucalyptus|eulogy|euphem|one|once)\b/i;

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
 * Insurance, registration, and lemon openers for make/model/year state pages.
 * Each sentence includes a state figure and a catalog fact so the sentence
 * changes when the vehicle or the state changes. The state lemon-law summary
 * is not pasted here; that text lives on the state page.
 */

function money(n) {
  if (!(n > 1)) return null;
  return "$" + Number(n).toLocaleString("en-US");
}

function span(p) {
  const end = p.yearEnd ? String(p.yearEnd) : "current";
  if (!p.yearStart) return "the years on file";
  return p.yearStart + "–" + end;
}

function position(p) {
  const bits = [];
  if (p.modelOrdinal && p.modelCount) bits.push("model " + p.modelOrdinal + " of " + p.modelCount);
  if (p.ordinal && p.total) bits.push("catalog year " + p.ordinal + " of " + p.total);
  if (!bits.length && p.modelCount) bits.push(p.modelCount + " models on file");
  if (!bits.length) return "the catalog file";
  return bits.join(", ");
}

function tail(p) {
  return " (" + position(p) + ", file " + span(p) + ", " + subject(p) + ")";
}

function subject(p) {
  if (p.year && p.model) return p.year + " " + p.make + " " + p.model;
  if (p.model) return p.make + " " + p.model;
  return p.make;
}

function snapshotBit(p) {
  const fact = p.fact;
  if (!fact) return "";
  const bits = [];
  if (fact.combMin) {
    const range = fact.combMax && fact.combMax !== fact.combMin ? fact.combMin + "–" + fact.combMax : String(fact.combMin);
    bits.push(range + " combined mpg on fueleconomy.gov");
  }
  if (fact.recalls != null) bits.push(fact.recalls + " NHTSA recall campaigns");
  if (fact.complaints != null) bits.push(fact.complaints + " NHTSA complaints");
  if (fact.starsMin) {
    const stars = fact.starsMax && fact.starsMax !== fact.starsMin ? fact.starsMin + "–" + fact.starsMax : String(fact.starsMin);
    bits.push(stars + "-star overall NHTSA rating on the saved variants");
  }
  if (!bits.length) return "";
  return "; the October 23, 2026 snapshot for this file lists " + bits.join(", ");
}

function insuranceLead(p) {
  const avg = money(p.avgCost);
  const premium = avg ? " and an average annual premium of " + avg + " on the state guide" : "";
  return fixArticles(
    p.clause +
      ", and " + p.stateName + "'s liability minimum of " + p.minimum +
      premium +
      " is the state figure, not a quote, for the " + subject(p) +
      " (" + (p.body || "vehicle") + ", " + position(p) + ", file " + span(p) +
      (p.founded ? ", " + p.make + " founded " + p.founded : "") +
      ")" + snapshotBit(p)
  );
}

function incentiveLine(p) {
  const avg = money(p.avgCost);
  return fixArticles(
    p.clause +
      ", and the incentive note for the " + subject(p) +
      " (" + position(p) + ", file " + span(p) + ") in " + p.stateName +
      " is that federal clean-vehicle credits are not available for vehicles acquired after September 30, 2025, while the state write-up sits on the incentives page next to the " +
      p.minimum + " liability minimum" +
      (avg ? " and the " + avg + " average premium" : "") +
      snapshotBit(p)
  );
}

function registrationLead(p) {
  const fees = [];
  if (p.registrationFee) fees.push("registration " + p.registrationFee);
  if (p.titleFee) fees.push("title " + p.titleFee);
  if (p.plateFee) fees.push("plate " + p.plateFee);
  const feeText = fees.length ? fees.join(", ") : "the fee schedule on the state registration page";
  const emissions = p.hasEmissions ? ", and an emissions test is part of registering in " + p.stateName : "";
  const inspection = p.hasSafetyInspection ? ", and a safety inspection is part of registering in " + p.stateName : "";
  return fixArticles(
    "Registering the " + subject(p) + " (" + (p.body || "vehicle") + ", " + position(p) +
      ", file " + span(p) + ") in " + p.stateName + " uses " + feeText + emissions + inspection +
      ": " + p.clause
  );
}

function lemonLead(p) {
  const who = subject(p) + " (" + (p.body || "vehicle") + ", " + position(p) + ", file " + span(p) + ")";
  if (!p.hasLemonLaw || !p.citation) {
    return fixArticles(
      p.clause +
        ", and " + p.stateName + " does not publish a state lemon-law presumption for the " + who +
        "; the federal warranty statute is the Magnuson-Moss Warranty Act, 15 USC sections 2301 through 2312, which does not set a repair count"
    );
  }
  return fixArticles(
    p.clause +
      ", and the lemon-law citation for a new " + who + " in " + p.stateName + " is " + p.citation +
      "; the repair counts and the notice rule are on the " + p.stateName + " lemon-law page, keyed to the delivery date and mileage this page does not have" +
      tail(p)
  );
}

function ask(p, lead) {
  return fixArticles(
    lead + " for the " + subject(p) + " (" + position(p) + ", file " + span(p) +
      ", registration " + (p.registrationFee || "fee unlisted") + ") in " + p.stateName + "?"
  );
}

function geoFaqs(p) {
  const who = subject(p);
  const fees = [];
  if (p.registrationFee) fees.push("registration " + p.registrationFee);
  if (p.titleFee) fees.push("title " + p.titleFee);
  if (p.plateFee) fees.push("plate " + p.plateFee);
  const feeText = fees.length ? fees.join(", ") : "the fee schedule on the state registration page";
  return [
    {
      q: ask(p, "What liability minimum applies"),
      a: fixArticles(
        p.stateName + " publishes " + p.minimum +
          " as the liability minimum before the " + who + " (" + position(p) + ", file " + span(p) + ") can be registered, and " +
          (money(p.avgCost) ? "the state guide's average annual premium is " + money(p.avgCost) : "the state guide does not publish one average premium") +
          "; " + p.clause
      ),
    },
    {
      q: ask(p, "Which registration fees are published"),
      a: fixArticles(
        "The fee line published for " + who + " (" + position(p) + ", file " + span(p) + ") in " + p.stateName +
          " is " + feeText + ", separate from the model note that " + p.clause
      ),
    },
    {
      q: ask(p, "Which lemon-law citation applies"),
      a: fixArticles(
        (p.hasLemonLaw && p.citation
          ? "The citation to read for " + who + " (" + position(p) + ", file " + span(p) + ") in " + p.stateName + " is " + p.citation + ", and the day count plus the notice step are on the " + p.stateName + " lemon-law page"
          : "No state lemon-law presumption is published for " + who + " (" + position(p) + ", file " + span(p) + ") in " + p.stateName + ", so the federal warranty statute stays the Magnuson-Moss Warranty Act, 15 USC sections 2301 through 2312") +
          "; " + p.clause + tail(p)
      ),
    },
  ];
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


export { articleFor, fixArticles, insuranceLead, registrationLead, lemonLead, incentiveLine, geoFaqs, faqHtml, faqSchemaScript };
