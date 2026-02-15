#!/usr/bin/env node
/**
 * add-backlog-models.js
 * Adds 12 new vehicle models and their model-year entries to the Car Alpha data files.
 */

const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '..', 'src', '_data', 'models.json');
const MODEL_YEARS_PATH = path.join(__dirname, '..', 'src', '_data', 'modelYears.json');

// ---------------------------------------------------------------------------
// 1. Read existing data
// ---------------------------------------------------------------------------
const models = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
const modelYears = JSON.parse(fs.readFileSync(MODEL_YEARS_PATH, 'utf8'));

// Build a Set of existing model keys for duplicate detection
const existingModelKeys = new Set(models.map(m => `${m.makeSlug}|${m.slug}`));

// ---------------------------------------------------------------------------
// 2. Define the 12 new models
// ---------------------------------------------------------------------------
const newModels = [
  {
    slug: "nsx",
    name: "NSX",
    makeSlug: "acura",
    makeName: "Acura",
    bodyType: "Coupe",
    yearStart: 1991,
    yearEnd: 2022,
    description: "The Acura NSX is a mid-engine sports car that revolutionized the supercar segment when it debuted in 1991, proving that a daily-drivable exotic was possible. The first generation featured a hand-built V6 with VTEC technology, while the second generation (2017-2022) added a twin-turbo V6 hybrid powertrain with three electric motors delivering 573 horsepower and Super Handling All-Wheel Drive."
  },
  {
    slug: "hummer-ev",
    name: "Hummer EV",
    makeSlug: "gmc",
    makeName: "GMC",
    bodyType: "Truck/SUV",
    yearStart: 2022,
    yearEnd: null,
    description: "The GMC Hummer EV is a fully electric supertruck that revives the Hummer nameplate with 1,000 horsepower, 11,500 lb-ft of torque, and innovative features like CrabWalk diagonal driving and Extract Mode adjustable suspension. Available as both a pickup truck and SUV, the Hummer EV combines extreme off-road capability with zero emissions and a 350-mile range."
  },
  {
    slug: "442",
    name: "442",
    makeSlug: "oldsmobile",
    makeName: "Oldsmobile",
    bodyType: "Coupe",
    yearStart: 1964,
    yearEnd: 1987,
    description: "The Oldsmobile 442 was a legendary American muscle car whose name originally stood for four-barrel carburetor, four-speed manual transmission, and dual exhaust. Born as an option package on the Cutlass, the 442 became its own model known for combining big-block V8 power with refined handling that earned it the nickname 'the gentleman\u0027s muscle car.'"
  },
  {
    slug: "barracuda",
    name: "Barracuda",
    makeSlug: "plymouth",
    makeName: "Plymouth",
    bodyType: "Coupe",
    yearStart: 1964,
    yearEnd: 1974,
    description: "The Plymouth Barracuda was one of the original pony cars, debuting two weeks before the Ford Mustang in 1964. The third-generation Barracuda (1970-1974), especially the Hemi \u0027Cuda variant with its 426 Hemi V8, is one of the most valuable and sought-after muscle cars ever produced, commanding millions at auction."
  },
  {
    slug: "road-runner",
    name: "Road Runner",
    makeSlug: "plymouth",
    makeName: "Plymouth",
    bodyType: "Coupe",
    yearStart: 1968,
    yearEnd: 1980,
    description: "The Plymouth Road Runner was a no-frills muscle car that stripped away luxury features to deliver maximum performance at a budget price, licensed its name and iconic \u0027beep beep\u0027 horn from Warner Bros. The Road Runner with the 426 Hemi was one of the fastest production cars of the muscle car era and remains a highly collectible classic."
  },
  {
    slug: "iq",
    name: "iQ",
    makeSlug: "scion",
    makeName: "Scion",
    bodyType: "Hatchback",
    yearStart: 2012,
    yearEnd: 2015,
    description: "The Scion iQ was one of the smallest cars ever sold in America, a micro-subcompact hatchback measuring just 120 inches long \u2014 shorter than a Smart ForTwo. Despite its tiny footprint, the iQ featured a unique rear-seat design with offset seating for three passengers and earned the Guinness World Record for most airbags in a production car with eleven."
  },
  {
    slug: "swift",
    name: "Swift",
    makeSlug: "suzuki",
    makeName: "Suzuki",
    bodyType: "Hatchback",
    yearStart: 1989,
    yearEnd: 2001,
    description: "The Suzuki Swift was a subcompact car that offered nimble handling and excellent fuel economy at a budget-friendly price. The sport-tuned Swift GTi version earned a cult following among autocross enthusiasts for its lightweight chassis and rev-happy engine. The Swift was also sold as the Geo Metro and Chevrolet Metro through a partnership with General Motors."
  },
  {
    slug: "samurai",
    name: "Samurai",
    makeSlug: "suzuki",
    makeName: "Suzuki",
    bodyType: "SUV",
    yearStart: 1986,
    yearEnd: 1995,
    description: "The Suzuki Samurai was a compact off-road SUV that became wildly popular in the late 1980s for its affordable price and genuine 4x4 capability. Despite a controversial Consumer Reports rollover test in 1988, the Samurai built a loyal following among off-road enthusiasts who appreciated its lightweight body, solid axles, and low-range transfer case for serious trail work."
  },
  {
    slug: "hombre",
    name: "Hombre",
    makeSlug: "isuzu",
    makeName: "Isuzu",
    bodyType: "Truck",
    yearStart: 1996,
    yearEnd: 2000,
    description: "The Isuzu Hombre was a compact pickup truck based on the Chevrolet S-10 platform, representing Isuzu\u0027s attempt to compete in the American small truck segment. Available in regular and extended cab configurations with rear-wheel or four-wheel drive, the Hombre offered reliable transportation for light-duty hauling at a competitive price."
  },
  {
    slug: "evija",
    name: "Evija",
    makeSlug: "lotus",
    makeName: "Lotus",
    bodyType: "Coupe",
    yearStart: 2024,
    yearEnd: null,
    description: "The Lotus Evija is a limited-production all-electric hypercar producing nearly 2,000 horsepower from four electric motors, making it one of the most powerful production cars ever built. With a target weight under 1,700 kg and advanced aerodynamics inspired by Le Mans prototypes, the Evija represents the absolute pinnacle of Lotus engineering and the future of electric performance."
  },
  {
    slug: "765lt",
    name: "765LT",
    makeSlug: "mclaren",
    makeName: "McLaren",
    bodyType: "Coupe",
    yearStart: 2021,
    yearEnd: 2022,
    description: "The McLaren 765LT is a limited-edition, track-focused supercar that represents the lightest and most powerful Longtail model in McLaren\u0027s history. With 755 horsepower from a twin-turbo V8, extensive carbon fiber bodywork, and a dry weight of just 2,709 pounds, the 765LT delivers a visceral driving experience that bridges the gap between road car and race car."
  },
  {
    slug: "dmc-12",
    name: "DMC-12",
    makeSlug: "delorean",
    makeName: "DeLorean",
    bodyType: "Coupe",
    yearStart: 1981,
    yearEnd: 1983,
    description: "The DeLorean DMC-12 is an iconic sports car featuring a brushed stainless steel body and distinctive gull-wing doors, designed by Giorgetto Giugiaro and engineered by Lotus. While its rear-mounted PRV V6 engine and performance were modest, the DMC-12 achieved lasting fame as the time machine in the Back to the Future trilogy, making it one of the most recognizable cars in pop culture history."
  }
];

// ---------------------------------------------------------------------------
// 3. Define year-range overrides for models with production gaps
// ---------------------------------------------------------------------------
function getYearsForModel(model) {
  const endYear = model.yearEnd === null ? 2026 : model.yearEnd;

  // Acura NSX: 1991-2005 and 2017-2022 (skip 2006-2016)
  if (model.makeSlug === 'acura' && model.slug === 'nsx') {
    const years = [];
    for (let y = 1991; y <= 2005; y++) years.push(y);
    for (let y = 2017; y <= 2022; y++) years.push(y);
    return years;
  }

  // Oldsmobile 442: 1964-1971 and 1985-1987 (skip 1972-1984)
  if (model.makeSlug === 'oldsmobile' && model.slug === '442') {
    const years = [];
    for (let y = 1964; y <= 1971; y++) years.push(y);
    for (let y = 1985; y <= 1987; y++) years.push(y);
    return years;
  }

  // All others: continuous range
  const years = [];
  for (let y = model.yearStart; y <= endYear; y++) years.push(y);
  return years;
}

// ---------------------------------------------------------------------------
// 4. Add models and model-year entries
// ---------------------------------------------------------------------------
let modelsAdded = 0;
let modelYearsAdded = 0;

for (const model of newModels) {
  const key = `${model.makeSlug}|${model.slug}`;
  if (existingModelKeys.has(key)) {
    console.log(`SKIP: ${model.makeName} ${model.name} already exists in models.json`);
    continue;
  }

  // Add model entry
  models.push({
    slug: model.slug,
    name: model.name,
    makeSlug: model.makeSlug,
    makeName: model.makeName,
    yearStart: model.yearStart,
    yearEnd: model.yearEnd,
    bodyType: model.bodyType,
    description: model.description
  });
  modelsAdded++;

  // Generate model-year entries
  const years = getYearsForModel(model);
  for (const year of years) {
    modelYears.push({
      slug: model.slug,
      name: model.name,
      makeSlug: model.makeSlug,
      makeName: model.makeName,
      bodyType: model.bodyType,
      year: year
    });
    modelYearsAdded++;
  }

  console.log(`ADDED: ${model.makeName} ${model.name} -- ${years.length} model-year entries (${years[0]}-${years[years.length - 1]})`);
}

// ---------------------------------------------------------------------------
// 5. Write updated files back
// ---------------------------------------------------------------------------
fs.writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2) + '\n', 'utf8');
fs.writeFileSync(MODEL_YEARS_PATH, JSON.stringify(modelYears, null, 2) + '\n', 'utf8');

// ---------------------------------------------------------------------------
// 6. Print summary
// ---------------------------------------------------------------------------
console.log('\n========== SUMMARY ==========');
console.log(`Models added:      ${modelsAdded}`);
console.log(`Model-years added: ${modelYearsAdded}`);
console.log(`Total models now:      ${models.length}`);
console.log(`Total model-years now: ${modelYears.length}`);
