// Generates slice-gated modelStates data at build time.
// Reads flags.json to determine which makes are in the current slice.
// Filters modelStatesAll.json to only include models belonging to the active slice's makes.
// Slices are NOT cumulative — only the current slice's makes are included.

const allModelStates = require("./modelStatesAll.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableModelStates) {
    return [];
  }

  // Get makes for the current slice only (not cumulative)
  const currentSlice = flags.slice != null ? flags.slice : 0;
  const sliceMakes = flags.slices[String(currentSlice)];
  if (!sliceMakes || !sliceMakes.length) {
    return [];
  }
  const activeMakeSet = new Set(sliceMakes);

  const filtered = allModelStates.filter(function (entry) {
    return activeMakeSet.has(entry.makeSlug);
  });
  console.log("[modelStates] Slice " + currentSlice + ": " + filtered.length + " pages for makes [" + sliceMakes.join(", ") + "]");
  return filtered;
};
