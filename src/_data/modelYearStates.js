// Generates slice-gated modelYearStates data at build time.
// Reads flags.json to determine which makes are in the current slice.
// Cross-references modelYears.json x states.json for the active slice's makes only.
// Slices are NOT cumulative — only the current slice's makes are included.
// Optimized: uses Set for lookups, shared state/make refs to reduce per-entry memory.

const modelYears = require("./modelYears.json");
const states = require("./states.json");
const makes = require("./makes.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableModelYearStates) {
    return [];
  }

  // Get makes for the current slice only (not cumulative)
  const currentSlice = flags.slice != null ? flags.slice : 0;
  const sliceMakes = flags.slices[String(currentSlice)];
  if (!sliceMakes || !sliceMakes.length) {
    return [];
  }
  const activeMakeSet = new Set(sliceMakes);

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
    var make = makeLookup[my.makeSlug] || { country: "", type: "mainstream" };
    var baseObj = {
      modelSlug: my.slug,
      modelName: my.name,
      makeSlug: my.makeSlug,
      makeName: my.makeName,
      makeCountry: make.country,
      makeType: make.type,
      bodyType: my.bodyType,
      year: my.year,
    };
    for (var i = 0; i < stateObjs.length; i++) {
      result.push(Object.assign({}, baseObj, stateObjs[i]));
    }
  });

  return result;
};
