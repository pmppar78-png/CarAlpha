// Generates batch-gated makeStates data at build time.
// Reads flags.json to determine which makes are active for the current batch.
// Filters makeStatesAll.json to only include active makes.

const allMakeStates = require("./makeStatesAll.json");
const flags = require("./flags.json");

module.exports = function () {
  if (!flags.enableMakeStates) {
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

  // Apply makeBatchSize gating: limit to (batch+1)*makeBatchSize makes
  const makeBatchSize = flags.makeBatchSize || 5;
  const maxMakes = (currentBatch + 1) * makeBatchSize;

  // Get ordered active makes, capped at maxMakes
  const activeMakes = [];
  for (let i = 0; i <= currentBatch; i++) {
    const batchMakes = flags.batches[String(i)];
    if (batchMakes) {
      for (var j = 0; j < batchMakes.length; j++) {
        if (activeMakes.length < maxMakes) {
          activeMakes.push(batchMakes[j]);
        }
      }
    }
  }
  const finalMakeSet = new Set(activeMakes);

  return allMakeStates.filter(function (entry) {
    return finalMakeSet.has(entry.makeSlug);
  });
};
