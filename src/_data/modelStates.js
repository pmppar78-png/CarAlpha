// Generates CUMULATIVE modelStates data at build time.
// Reads flags.json to determine the current slice index.
// Includes ALL makes from slices 0 through (slice - 1) so pages accumulate across runs.

const allModelStates = require("./modelStatesAll.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableModelStates) {
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
    console.log("[modelStates] No cumulative makes yet (slice " + currentSlice + ")");
    return [];
  }

  const filtered = allModelStates.filter(function (entry) {
    return activeMakeSet.has(entry.makeSlug);
  });
  console.log("[modelStates] Cumulative slices 0.." + (currentSlice - 1) + ": " + filtered.length + " pages (" + activeMakeSet.size + " makes)");
  return filtered;
};
