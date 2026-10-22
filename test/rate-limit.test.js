"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../lib/rate-limit");

test("allows up to max calls inside the window", function () {
  let t = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 3, now: function () { return t; } });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
});

test("a different key has its own window", function () {
  let t = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 1, now: function () { return t; } });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
  assert.equal(limiter.allow("b"), true);
});

test("the window resets after windowMs", function () {
  let t = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 1, now: function () { return t; } });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
  t += 10_000;
  assert.equal(limiter.allow("a"), true);
});
