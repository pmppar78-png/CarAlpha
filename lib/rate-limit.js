"use strict";

/**
 * Fixed-window counter. `now` is injectable so tests do not sleep.
 * Returns true when the call is allowed.
 */
function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 20, now = function () { return Date.now(); } } = {}) {
  const buckets = new Map();

  function allow(key) {
    const id = String(key || "unknown");
    const t = now();
    let bucket = buckets.get(id);
    if (!bucket || t - bucket.start >= windowMs) {
      bucket = { start: t, count: 0 };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (t - v.start >= windowMs) buckets.delete(k);
      }
    }
    return bucket.count <= max;
  }

  return { allow, size: function () { return buckets.size; } };
}

module.exports = { createRateLimiter };
