const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "src", "_data");
const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "netlify",
  "edge-functions",
  "vehicle-data.json"
);

function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function buildEdgeData() {
  const makesArray = readJSON("makes.json");
  const modelsArray = readJSON("models.json");
  const modelYearsArray = readJSON("modelYears.json");
  const statesArray = readJSON("states.json");

  // -- makes: keyed by slug --
  const makes = {};
  for (const make of makesArray) {
    makes[make.slug] = {
      name: make.name,
      type: make.type,
      country: make.country,
    };
  }

  // -- models: keyed by "makeSlug/modelSlug" --
  const models = {};
  for (const model of modelsArray) {
    const key = `${model.makeSlug}/${model.slug}`;
    models[key] = {
      name: model.name,
      bodyType: model.bodyType,
      makeName: model.makeName,
      makeSlug: model.makeSlug,
      yearStart: model.yearStart,
      yearEnd: model.yearEnd ?? null,
    };
  }

  // -- modelYears: keyed by "makeSlug/modelSlug/year" --
  const modelYears = {};
  for (const entry of modelYearsArray) {
    const key = `${entry.makeSlug}/${entry.slug}/${entry.year}`;
    modelYears[key] = {
      name: entry.name,
      makeName: entry.makeName,
      bodyType: entry.bodyType,
    };
  }

  // -- states: keyed by slug --
  const states = {};
  for (const state of statesArray) {
    states[state.slug] = {
      name: state.name,
      abbreviation: state.abbreviation,
      region: state.region,
      insuranceMinimum: state.insuranceMinimum,
      averageInsuranceCost: state.averageInsuranceCost,
      hasLemonLaw: state.hasLemonLaw,
      evIncentives: state.evIncentives,
    };
  }

  // -- modelsByMake: { makeSlug: [modelSlug, ...] } --
  const modelsByMake = {};
  for (const model of modelsArray) {
    if (!modelsByMake[model.makeSlug]) {
      modelsByMake[model.makeSlug] = [];
    }
    if (!modelsByMake[model.makeSlug].includes(model.slug)) {
      modelsByMake[model.makeSlug].push(model.slug);
    }
  }

  // -- yearsByModel: { "makeSlug/modelSlug": [year, ...] } --
  const yearsByModel = {};
  for (const entry of modelYearsArray) {
    const key = `${entry.makeSlug}/${entry.slug}`;
    if (!yearsByModel[key]) {
      yearsByModel[key] = [];
    }
    yearsByModel[key].push(entry.year);
  }
  // Sort years ascending for each model
  for (const key of Object.keys(yearsByModel)) {
    yearsByModel[key].sort((a, b) => a - b);
  }

  // -- statesByRegion: { region: [stateSlug, ...] } --
  const statesByRegion = {};
  for (const state of statesArray) {
    if (!statesByRegion[state.region]) {
      statesByRegion[state.region] = [];
    }
    statesByRegion[state.region].push(state.slug);
  }

  const output = {
    makes,
    models,
    modelYears,
    states,
    modelsByMake,
    yearsByModel,
    statesByRegion,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const sizeBytes = fs.statSync(OUTPUT_PATH).size;
  const sizeKB = (sizeBytes / 1024).toFixed(1);

  console.log(`Edge data built successfully.`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log(`  Size:   ${sizeKB} KB`);
  console.log(`  Makes:  ${Object.keys(makes).length}`);
  console.log(`  Models: ${Object.keys(models).length}`);
  console.log(`  Model-Years: ${Object.keys(modelYears).length}`);
  console.log(`  States: ${Object.keys(states).length}`);
}

buildEdgeData();
