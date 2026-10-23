"use strict";

/**
 * Keyword matching and the URL allowlist for the vehicle assistant.
 * Every keyword is a whole word. "ev" must not match "every", "review",
 * "level", "seven", or "development".
 *
 * Partner destinations stay on the existing /go/ keys. No new affiliate
 * id is invented here. A recall is not a YourMechanic visit: the recall
 * button goes to NHTSA, and /go/mechanics stays available for repairs.
 */

const NHTSA_RECALLS = "https://www.nhtsa.gov/recalls";

const TOPICS = [
  { id: "recall", pattern: "recalls?" },
  { id: "insurance", pattern: "insurance" },
  { id: "warranty", pattern: "warrant(?:y|ies)" },
  { id: "loans", pattern: "loans?|refi(?:nance|nancing)?|financ(?:e|es|ed|ing)" },
  { id: "sell", pattern: "sell(?:s|ing)?|trades?|trade-ins?" },
  { id: "repair", pattern: "repairs?|mechanics?" },
  { id: "lemon", pattern: "lemons?" },
  { id: "ev", pattern: "evs?|electric|chargers?|charging" },
  { id: "history", pattern: "history|carfax|accidents?|title checks?" },
];

const GO_KEYS = [
  "insurance",
  "warranty",
  "loans",
  "refinance",
  "sell",
  "repair",
  "mechanics",
  "mechanic",
  "lemon-law",
  "ev-charger",
];

const SITE_PREFIXES = [
  "/vin-decoder",
  "/recall-checker",
  "/recalls",
  "/free-vin-check",
  "/guides/lemon-law",
  "/guides/insurance",
  "/guides/warranties",
  "/guides/repairs",
  "/guides/financing",
  "/compare",
  "/states",
];

const OFFICIAL = [
  "https://www.carfax.com/",
  NHTSA_RECALLS,
  "https://vpic.nhtsa.dot.gov/",
  "https://www.naag.org/find-my-ag",
  "https://consumer.ftc.gov/articles/auto-trade-ins-and-negative-equity-when-you-owe-more-your-car-worth",
  "https://consumer.ftc.gov/articles/auto-warranties-and-auto-service-contracts",
  "https://consumer.ftc.gov/articles/buying-used-car-dealer",
  "https://www.irs.gov/clean-vehicle-tax-credits",
  "https://www.fueleconomy.gov/feg/maintain.jsp",
];

function mentions(text, pattern) {
  return new RegExp("\\b(?:" + pattern + ")\\b", "i").test(String(text || ""));
}

function topicFor(text) {
  const source = String(text || "");
  for (let i = 0; i < TOPICS.length; i += 1) {
    if (mentions(source, TOPICS[i].pattern)) return TOPICS[i].id;
  }
  return null;
}

function pathOnly(value) {
  return String(value || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

function sitePathAllowed(path) {
  if (GO_KEYS.some(function (key) {
    return path === "/go/" + key;
  })) return true;
  return SITE_PREFIXES.some(function (prefix) {
    return path === prefix || path.indexOf(prefix + "/") === 0;
  });
}

function isApprovedUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || /\s/.test(value)) return false;
  if (value.charAt(0) === "/") return sitePathAllowed(pathOnly(value));
  if (value.charAt(0) === "#") return false;

  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = pathOnly(parsed.pathname);
  if (host === "caralpha.org") return sitePathAllowed(path);

  return OFFICIAL.some(function (allowed) {
    const target = new URL(allowed);
    const allowedHost = target.hostname.replace(/^www\./, "").toLowerCase();
    const allowedPath = pathOnly(target.pathname);
    if (host !== allowedHost) return false;
    if (allowedPath === "/") return path === "/";
    return path === allowedPath || path.indexOf(allowedPath + "/") === 0;
  });
}

function approvedLinkRules() {
  const lines = [
    "Links you may output:",
    "A URL is allowed only when it is on this list. Do not invent a partner, a coupon code, or a tracking id. Any other URL is removed before the answer is shown.",
    "A safety recall is repaired at a franchised dealer of that make. Send the reader to " + NHTSA_RECALLS + " or /recall-checker/. Do not send a recall to YourMechanic or /go/mechanics. /go/mechanics is only for hiring a mechanic, and /go/repair is the repair-estimate link.",
  ];
  GO_KEYS.forEach(function (key) {
    lines.push("- /go/" + key + "/");
  });
  SITE_PREFIXES.forEach(function (prefix) {
    lines.push("- " + prefix + "/");
  });
  OFFICIAL.forEach(function (url) {
    lines.push("- " + url);
  });
  lines.push("- The same paths on https://caralpha.org");
  return lines.join("\n");
}

function sanitizeAssistantText(text) {
  let out = String(text || "");

  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (whole, attrs, label) {
    const match = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (!match) return label;
    return isApprovedUrl(match[2]) ? whole : label;
  });

  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, function (whole, label, url) {
    return isApprovedUrl(url) ? whole : label;
  });

  out = out.replace(/https?:\/\/[^\s<>"')\]]+/gi, function (url) {
    const core = url.replace(/[.,;:!?]+$/, "");
    const trail = url.slice(core.length);
    return isApprovedUrl(core) ? core + trail : trail;
  });

  return out;
}

module.exports = {
  NHTSA_RECALLS: NHTSA_RECALLS,
  TOPICS: TOPICS,
  GO_KEYS: GO_KEYS,
  mentions: mentions,
  topicFor: topicFor,
  isApprovedUrl: isApprovedUrl,
  approvedLinkRules: approvedLinkRules,
  sanitizeAssistantText: sanitizeAssistantText,
};
