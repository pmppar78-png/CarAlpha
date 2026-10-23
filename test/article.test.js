"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { articleFor, fixArticles } = require("../lib/article");

test("vowel-sound vehicle names take an", function () {
  assert.equal(articleFor("Audi"), "an");
  assert.equal(articleFor("Infiniti"), "an");
  assert.equal(articleFor("Escape"), "an");
  assert.equal(articleFor("Acura"), "an");
  assert.equal(articleFor("Odyssey"), "an");
  assert.equal(articleFor("Equinox"), "an");
  assert.equal(fixArticles("Decode a Audi VIN"), "Decode an Audi VIN");
  assert.equal(fixArticles("buying a Infiniti"), "buying an Infiniti");
  assert.equal(fixArticles("a Escape owner"), "an Escape owner");
});

test("consonant names and letter-codes", function () {
  assert.equal(articleFor("Honda"), "a");
  assert.equal(articleFor("BMW"), "a");
  assert.equal(articleFor("CR-V"), "a");
  assert.equal(articleFor("F-150"), "an");
  assert.equal(articleFor("HR-V"), "an");
  assert.equal(articleFor("SUV"), "an");
  assert.equal(articleFor("Q5"), "a");
  assert.equal(articleFor("X5"), "an");
  assert.equal(articleFor("ID.4"), "an");
  assert.equal(fixArticles("a Honda Civic"), "a Honda Civic");
  assert.equal(fixArticles("a F-150"), "an F-150");
  assert.equal(fixArticles("a CR-V"), "a CR-V");
});

test("numbers and you-sound words", function () {
  assert.equal(articleFor("8"), "an");
  assert.equal(articleFor("8-year-old"), "an");
  assert.equal(articleFor("11"), "an");
  assert.equal(articleFor("18-month"), "an");
  assert.equal(articleFor("2018"), "a");
  assert.equal(articleFor("4"), "a");
  assert.equal(articleFor("unique"), "a");
  assert.equal(articleFor("used"), "a");
  assert.equal(articleFor("useful"), "a");
  assert.equal(articleFor("ugly"), "an");
  assert.equal(articleFor("one"), "a");
  assert.equal(articleFor("hour"), "an");
  assert.equal(articleFor("unibody"), "a");
  assert.equal(fixArticles("The Honda Ridgeline is an unibody truck"), "The Honda Ridgeline is a unibody truck");
  assert.equal(articleFor("A4"), "an");
  assert.equal(articleFor("Outback"), "an");
  assert.equal(fixArticles("a 8-year-old Escape"), "an 8-year-old Escape");
  assert.equal(fixArticles("a 2018 Audi"), "a 2018 Audi");
});
