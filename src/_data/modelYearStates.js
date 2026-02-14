// Generates modelYearStates data at build time.
// Reads flags.json to determine which makes are active for the current batch.
// Cross-references modelYears.json x states.json for active makes only.
// Optimized: uses Set for lookups, shared state/make refs to reduce per-entry memory.

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
  const activeMakeSet = new Set();
  for (let i = 0; i <= currentBatch; i++) {
    const batchMakes = config.batches[String(i)];
    if (batchMakes) {
      batchMakes.forEach(function (s) { activeMakeSet.add(s); });
    }
  }

  // Filter modelYears to only active makes (Set.has is O(1))
  const filteredModelYears = modelYears.filter(function (entry) {
    return activeMakeSet.has(entry.makeSlug);
  });

  // Build make lookup for type/country — store only needed fields
  const makeLookup = {};
  makes.forEach(function (m) {
    makeLookup[m.slug] = { country: m.country || "", type: m.type || "mainstream" };
  });

  // Pre-build shared state objects to avoid duplicating per entry
  const stateObjs = states.map(function (state) {
    return {
      stateSlug: state.slug,
      stateName: state.name,
      stateAbbr: state.abbreviation,
      stateRegion: state.region,
      insuranceMinimum: state.insuranceMinimum,
      averageInsuranceCost: state.averageInsuranceCost,
      hasLemonLaw: state.hasLemonLaw,
      evIncentives: state.evIncentives,
    };
  });

  // Cross-reference: each modelYear x each state
  // Use Object.assign to merge shared state data (avoids creating unique string refs)
  const result = [];
  filteredModelYears.forEach(function (my) {
    const make = makeLookup[my.makeSlug] || { country: "", type: "mainstream" };
    const baseObj = {
      modelSlug: my.slug,
      modelName: my.name,
      makeSlug: my.makeSlug,
      makeName: my.makeName,
      makeCountry: make.country,
      makeType: make.type,
      bodyType: my.bodyType,
      year: my.year,
    };
    for (let i = 0; i < stateObjs.length; i++) {
      result.push(Object.assign({}, baseObj, stateObjs[i]));
    }
  });

  return result;
};
