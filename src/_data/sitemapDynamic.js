// Generates sitemap URL entries for dynamically-rendered deep pages.
// These pages are served by Netlify Edge Functions, not as static HTML,
// but still need to appear in sitemaps for SEO crawling.

const makes = require("./makes.json");
const models = require("./models.json");
const modelYears = require("./modelYears.json");
const states = require("./states.json");

module.exports = function () {
  const result = [];

  // makeStates: make × state = ~3,000 entries
  for (const make of makes) {
    for (const state of states) {
      result.push({
        loc: `/makes/${make.slug}/in/${state.slug}/`,
        priority: "0.7",
      });
    }
  }

  // modelStates: model × state = ~15,450 entries
  for (const model of models) {
    for (const state of states) {
      result.push({
        loc: `/makes/${model.makeSlug}/${model.slug}/in/${state.slug}/`,
        priority: "0.6",
      });
    }
  }

  // modelYearStates: modelYear × state = ~178,300 entries
  for (const my of modelYears) {
    for (const state of states) {
      result.push({
        loc: `/makes/${my.makeSlug}/${my.slug}/${my.year}/in/${state.slug}/`,
        priority: "0.5",
      });
    }
  }

  console.log(`[sitemapDynamic] Generated ${result.length} sitemap entries for dynamic pages`);
  return result;
};
