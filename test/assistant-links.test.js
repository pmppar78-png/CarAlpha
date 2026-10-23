"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const links = require("../lib/assistant-links");

const appJs = fs.readFileSync(path.join(__dirname, "../src/assets/js/app.js"), "utf8");

test("ev does not match words that merely contain those letters", function () {
  ["every oil change", "read the review", "level the headlights", "seven recalls wait no", "development of the engine"].forEach(function (phrase) {
    assert.equal(links.topicFor(phrase) === "ev", false, phrase);
    assert.equal(links.mentions(phrase, "evs?"), false, phrase);
  });
});

test("ev, charger, and charging match as words", function () {
  assert.equal(links.topicFor("Where is an EV charger"), "ev");
  assert.equal(links.topicFor("electric charging near me"), "ev");
  assert.equal(links.topicFor("the chargers are down"), "ev");
});

test("other keywords are whole words too", function () {
  assert.equal(links.topicFor("the seller wants cash"), null);
  assert.equal(links.topicFor("I want to sell the car"), "sell");
  assert.equal(links.topicFor("lemonade is not a claim"), null);
  assert.equal(links.topicFor("this may be a lemon"), "lemon");
  assert.equal(links.topicFor("they gave me a loaner"), null);
  assert.equal(links.topicFor("refinance the loan"), "loans");
  assert.equal(links.topicFor("check the title"), null);
  assert.equal(links.topicFor("run a title check"), "history");
  assert.equal(links.topicFor("any open recalls?"), "recall");
  assert.equal(links.topicFor("a warranty question"), "warranty");
});

test("a recall question is not classified as a repair", function () {
  assert.equal(links.topicFor("recall repair at the dealer"), "recall");
});

test("the recall destination is NHTSA, and invented URLs are removed", function () {
  const dirty = "Book it at https://www.yourmechanic.com/book and also [dealer](https://evil.example/dealer). Confirm on https://www.nhtsa.gov/recalls.";
  const clean = links.sanitizeAssistantText(dirty);
  assert.equal(clean.includes("yourmechanic.com"), false);
  assert.equal(clean.includes("evil.example"), false);
  assert.equal(clean.includes("https://www.nhtsa.gov/recalls"), true);
  assert.equal(clean.includes("dealer"), true);
});

test("only approved paths and /go keys survive", function () {
  assert.equal(links.isApprovedUrl("/go/repair/?vin=ABC"), true);
  assert.equal(links.isApprovedUrl("/go/mechanics/"), true);
  assert.equal(links.isApprovedUrl("/go/bumper/"), false);
  assert.equal(links.isApprovedUrl("/recall-checker/"), true);
  assert.equal(links.isApprovedUrl("https://caralpha.org/guides/lemon-law/"), true);
  assert.equal(links.isApprovedUrl("https://www.nhtsa.gov/recalls?vin=1HGCM82633A004352"), true);
  assert.equal(links.isApprovedUrl("https://petinsurancereview.com/"), false);

  const markdown = links.sanitizeAssistantText("See [Bumper](/go/bumper/) or [recalls](/recall-checker/).");
  assert.equal(markdown.includes("/go/bumper/"), false);
  assert.equal(markdown.includes("[recalls](/recall-checker/)"), true);
  assert.equal(markdown.includes("Bumper"), true);
});

test("the prompt lists the same destinations the filter allows", function () {
  const rules = links.approvedLinkRules();
  assert.equal(rules.includes(links.NHTSA_RECALLS), true);
  assert.equal(rules.includes("/go/mechanics/"), true);
  assert.equal(rules.includes("Do not send a recall to YourMechanic"), true);
  links.GO_KEYS.forEach(function (key) {
    assert.equal(links.isApprovedUrl("/go/" + key + "/"), true);
  });
});

test("app.js uses word boundaries and does not send recalls to YourMechanic", function () {
  assert.equal(appJs.includes('.includes("ev")'), false);
  assert.equal(appJs.includes(".includes('ev')"), false);
  assert.equal(appJs.includes('affiliateCTA("Find a dealer", "mechanics"'), false);
  assert.equal(appJs.includes("https://www.nhtsa.gov/recalls"), true);
  assert.equal(appJs.includes("function mentions("), true);
  links.TOPICS.forEach(function (topic) {
    assert.equal(appJs.includes(topic.pattern), true, topic.pattern);
  });
});
