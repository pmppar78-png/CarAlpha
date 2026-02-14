// Generates batch-gated modelStates data at build time.
// Reads flags.json to determine which makes are active for the current batch.
// Filters modelStatesAll.json to only include models belonging to active makes.

const allModelStates = require("./modelStatesAll.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableModelStates) {
    return [];
  }

  // Collect all make slugs up to and including the current batch
  const currentBatch = flags.batch || 0;
  const activeMakeSet = new Set();
  for (let i = 0; i <= currentBatch; i++) {
    const batchMakes = flags.batches[String(i)];
    if (batchMakes) {
      batchMakes.forEach(function (s) { activeMakeSet.add(s); });
    }
  }

  // Apply modelBatchSize gating: limit total model-state entries
  // based on active makes (all models for active makes are included)
  return allModelStates.filter(function (entry) {
    return activeMakeSet.has(entry.makeSlug);
  });
};
