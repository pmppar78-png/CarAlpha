// Generates modelYearStates data at build time.
// Reads flags.json to determine which makes are active for the current batch.
// Cross-references modelYears.json x states.json for active makes only.

const modelYears = require("./modelYears.json");
const states = require("./states.json");
const makes = require("./makes.json");
const flags = require("./flags.json");

module.exports = function () {
  const config = flags.modelYearState;

  if (!config || !config.enabled) {
    return [];
  }

  // Collect all make slugs up to and including the current batch
  const currentBatch = config.batch || 0;
  const activeMakes = [];
  for (let i = 0; i <= currentBatch; i++) {
    const batchMakes = config.batches[String(i)];
    if (batchMakes) {
      activeMakes.push(...batchMakes);
    }
  }

  // Filter modelYears to only active makes
  const filteredModelYears = modelYears.filter(function (entry) {
    return activeMakes.includes(entry.makeSlug);
  });

  // Build make lookup for type/country
  const makeLookup = {};
  makes.forEach(function (m) {
    makeLookup[m.slug] = m;
  });

  // Cross-reference: each modelYear x each state
  const result = [];
  filteredModelYears.forEach(function (my) {
    const make = makeLookup[my.makeSlug] || {};
    states.forEach(function (state) {
      result.push({
        modelSlug: my.slug,
        modelName: my.name,
        makeSlug: my.makeSlug,
        makeName: my.makeName,
        makeCountry: make.country || "",
        makeType: make.type || "mainstream",
        bodyType: my.bodyType,
        year: my.year,
        stateSlug: state.slug,
        stateName: state.name,
        stateAbbr: state.abbreviation,
        stateRegion: state.region,
        insuranceMinimum: state.insuranceMinimum,
        averageInsuranceCost: state.averageInsuranceCost,
        hasLemonLaw: state.hasLemonLaw,
        evIncentives: state.evIncentives,
      });
    });
  });

  return result;
};
