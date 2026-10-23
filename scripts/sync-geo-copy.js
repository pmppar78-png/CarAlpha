"use strict";

/**
 * Edge functions cannot require the CJS helpers. This writes one ESM module
 * from lib/article.js and lib/geo-copy.js so the two copies cannot drift.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const article = fs.readFileSync(path.join(root, "lib", "article.js"), "utf8")
  .replace(/module\.exports[\s\S]*$/, "");
const geo = fs.readFileSync(path.join(root, "lib", "geo-copy.js"), "utf8")
  .replace(/const \{[^}]+\} = require\("\.\/article"\);\n/, "")
  .replace(/module\.exports[\s\S]*$/, "");

const out = article + "\n" + geo +
  "\nexport { articleFor, fixArticles, insuranceLead, registrationLead, lemonLead, incentiveLine, geoFaqs, factSentences, recordedLines, faqHtml, faqSchemaScript };\n" +
  "\n// Netlify bundles every file in this directory as an edge function.\n" +
  "// This module is a helper imported by vehicle-pages. The handler is not\n" +
  "// routed at a public path, so it does not change production responses.\n" +
  "export default async (request, context) => {\n" +
  "  return context.next();\n" +
  "};\n" +
  "\nexport const config = {\n" +
  "  path: \"/.netlify/geo-copy\",\n" +
  "};\n";

const dest = path.join(root, "netlify", "edge-functions", "geo-copy.js");
fs.writeFileSync(dest, out);
console.log("wrote " + dest);
