"use strict";

const { articleFor, fixArticles } = require("./article");

/**
 * Short ownership sentences for one make, model, or year in one state.
 * Each sentence names that vehicle and that state and uses a published figure.
 * Model descriptions and catalog positions are not repeated here.
 */

function money(n) {
  if (!(n > 1)) return null;
  return "$" + Number(n).toLocaleString("en-US");
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

function feePhrase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^included in registration$/i.test(raw)) return "included in the registration fee";
  if (/^\$/.test(raw) || /^[0-9]/.test(raw)) return raw;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function insuranceLines(p) {
  const lines = [
    sentence(named(p) + " in " + p.stateName + " has to carry at least " + p.minimum + " liability coverage"),
  ];
  const avg = money(p.avgCost);
  if (avg) {
    lines.push(sentence("The average annual premium on file for " + named(p) + " in " + p.stateName + " is " + avg));
  }
  return lines;
}

function insuranceLead(p) {
  return insuranceLines(p).join(" ");
}

function registrationLines(p) {
  const lines = [];
  if (p.registrationFee) {
    lines.push(sentence("The registration fee for " + named(p) + " in " + p.stateName + " is " + feePhrase(p.registrationFee)));
  }
  if (p.titleFee) {
    lines.push(sentence("The title fee for " + named(p) + " in " + p.stateName + " is " + feePhrase(p.titleFee)));
  }
  if (p.plateFee) {
    lines.push(sentence("The plate fee for " + named(p) + " in " + p.stateName + " is " + feePhrase(p.plateFee)));
  }
  if (!lines.length) {
    lines.push(sentence("Registration fees for " + named(p) + " in " + p.stateName + " are on the state registration page"));
  }
  if (p.hasEmissions) {
    lines.push(sentence(p.stateName + " requires an emissions test to register " + named(p)));
  }
  if (p.hasSafetyInspection) {
    lines.push(sentence(p.stateName + " requires a safety inspection to register " + named(p)));
  }
  return lines;
}

function registrationLead(p) {
  return registrationLines(p).join(" ");
}

function lemonLines(p) {
  if (!p.hasLemonLaw || !p.citation) {
    return [
      sentence(p.stateName + " does not publish a state lemon-law presumption for " + named(p)),
      sentence("The federal warranty statute that still applies to " + named(p) + " is the Magnuson-Moss Warranty Act, 15 U.S.C. sections 2301 through 2312"),
    ];
  }
  return [
    sentence("The lemon-law citation for " + named(p) + " in " + p.stateName + " is " + p.citation),
    sentence("Repair counts and the notice step for " + named(p) + " are on the " + p.stateName + " lemon-law page"),
  ];
}

function lemonLead(p) {
  return lemonLines(p).join(" ");
}

function incentiveLines(p) {
  const lines = [
    sentence("Federal clean-vehicle credits are not available for " + named(p) + " in " + p.stateName + " acquired after September 30, 2025"),
  ];
  const detail = String(p.evDetail || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!]+$/, "")
    .replace(/[.?!]\s+([A-Za-z][A-Za-z'’-]*)/g, function (_m, word) {
      if (/^[A-Z]{2,}$/.test(word)) return "; " + word;
      return "; " + word.charAt(0).toLowerCase() + word.slice(1);
    });
  if (detail) {
    lines.push(sentence("For " + named(p) + " in " + p.stateName + ", " + detail));
  }
  return lines;
}

function incentiveLine(p) {
  return incentiveLines(p).join(" ");
}

function ask(text) {
  return sentence(text).replace(/\.$/, "?");
}

function geoFaqs(p) {
  const avg = money(p.avgCost);
  const feeText = feeList(p);
  const insuranceAnswer = [
    sentence("The minimum that applies to " + named(p) + " in " + p.stateName + " is " + p.minimum),
  ];
  if (avg) {
    insuranceAnswer.push(sentence("Alongside that minimum, the average annual premium on file for " + named(p) + " in " + p.stateName + " is " + avg));
  }
  const lemonAnswer = p.hasLemonLaw && p.citation
    ? [sentence("For " + named(p) + " in " + p.stateName + ", start with " + p.citation)]
    : [sentence("No state lemon-law presumption is published for " + named(p) + " in " + p.stateName)];
  return [
    {
      q: ask("What liability minimum applies to " + named(p) + " in " + p.stateName),
      a: insuranceAnswer.join(" "),
    },
    {
      q: ask("What registration fees are published for " + named(p) + " in " + p.stateName),
      a: sentence(p.stateName + " lists " + feeText + " for " + named(p)),
    },
    {
      q: ask("Which lemon-law citation covers " + named(p) + " in " + p.stateName),
      a: lemonAnswer.join(" "),
    },
  ];
}

function mpgRange(min, max) {
  if (min == null) return "";
  if (max == null || Number(max) === Number(min)) return String(min);
  return min + "–" + max;
}

function factSentences(p) {
  const fact = p && p.fact;
  if (!fact) return [];
  const car = who(p);
  const place = p.stateName ? " in " + p.stateName : "";
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
        "On October 23, 2026, fueleconomy.gov listed one configuration of the " + car + place + label +
        " at " + fact.combMin + " combined mpg, " + fact.cityMin + " city and " + fact.hwyMin + " highway"
      ));
    } else {
      const low = fact.epaLow && fact.epaLow !== fact.epaHigh ? " on the " + fact.epaLow : "";
      const high = fact.epaHigh && fact.epaHigh !== fact.epaLow ? " on the " + fact.epaHigh : "";
      lines.push(sentence(
        "On October 23, 2026, fueleconomy.gov listed " + count + " configurations of the " + car + place
      ));
      lines.push(sentence(
        "Combined mileage for the " + car + place + " runs from " + fact.combMin + " mpg" + low + " to " + fact.combMax + " mpg" + high
      ));
      lines.push(sentence(
        "City mileage for the " + car + place + " is " + mpgRange(fact.cityMin, fact.cityMax) +
        " mpg, and highway mileage is " + mpgRange(fact.hwyMin, fact.hwyMax) + " mpg"
      ));
    }
  }
  if (fact.recalls != null) {
    const word = Number(fact.recalls) === 1 ? "campaign" : "campaigns";
    lines.push(sentence(
      "NHTSA recalls-by-vehicle listed " + fact.recalls + " " + word + " for the " + car + place + " on October 23, 2026"
    ));
  }
  if (fact.complaints != null) {
    lines.push(sentence(
      "The NHTSA complaint count for the " + car + place + " was " + fact.complaints + " on that date, which is not a defect finding"
    ));
  }
  if (fact.starsMin) {
    const stars = fact.starsMax && fact.starsMax !== fact.starsMin
      ? fact.starsMin + " to " + fact.starsMax
      : String(fact.starsMin);
    lines.push(sentence("Tested " + car + " vehicles" + place + " earned " + stars + " stars overall"));
  }
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
  faqHtml,
  faqSchemaScript,
};
