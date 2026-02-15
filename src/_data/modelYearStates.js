// Generates CUMULATIVE modelYearStates data at build time.
// Reads flags.json to determine the current slice index.
// Includes ALL makes from slices 0 through (slice - 1) so pages accumulate across runs.
// Optimized: uses Set for lookups, shared state/make refs to reduce per-entry memory.

const modelYears = require("./modelYears.json");
const states = require("./states.json");
const makes = require("./makes.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableModelYearStates) {
    return [];
  }

  // Collect makes from ALL slices 0..(currentSlice - 1) — cumulative
  const currentSlice = flags.slice != null ? flags.slice : 0;
  const activeMakeSet = new Set();
  for (var i = 0; i < currentSlice; i++) {
    var sliceMakes = flags.slices[String(i)];
    if (sliceMakes && sliceMakes.length) {
      sliceMakes.forEach(function (m) { activeMakeSet.add(m); });
    }
  }

  if (activeMakeSet.size === 0) {
    console.log("[modelYearStates] No cumulative makes yet (slice " + currentSlice + ")");
    return [];
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
  const expectedPages = filteredModelYears.length * stateObjs.length;
  console.log("[modelYearStates] Cumulative slices 0.." + (currentSlice - 1) + ": " + filteredModelYears.length + " modelYears x " + stateObjs.length + " states = " + expectedPages + " pages (" + activeMakeSet.size + " makes)");

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
