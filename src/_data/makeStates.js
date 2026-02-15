// Generates slice-gated makeStates data at build time.
// Reads flags.json to determine which makes are in the current slice.
// Filters makeStatesAll.json to only include makes from the active slice.
// Slices are NOT cumulative — only the current slice's makes are included.

const allMakeStates = require("./makeStatesAll.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableMakeStates) {
    return [];
  }

  // Get makes for the current slice only (not cumulative)
  const currentSlice = flags.slice != null ? flags.slice : 0;
  const sliceMakes = flags.slices[String(currentSlice)];
  if (!sliceMakes || !sliceMakes.length) {
    return [];
  }
  const activeMakeSet = new Set(sliceMakes);

  const filtered = allMakeStates.filter(function (entry) {
    return activeMakeSet.has(entry.makeSlug);
  });
  console.log("[makeStates] Slice " + currentSlice + ": " + filtered.length + " pages for makes [" + sliceMakes.join(", ") + "]");
  return filtered;
};
