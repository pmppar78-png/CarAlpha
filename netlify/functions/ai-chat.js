"use strict";

const { createRateLimiter } = require("../../lib/rate-limit");

const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

const SYSTEM_PROMPT = `You are Car Alpha's vehicle assistant. Answer in plain, specific prose for a U.S. driver. You know the subject well. You do not invent facts to sound complete.

VIN structure (ISO 3779, 17 characters, model year 1981 onward):
- Positions 1–3 are the World Manufacturer Identifier.
- Positions 4–8 are the vehicle descriptor. Position 9 is the check digit.
- Position 10 is the model year. The letter and digit codes repeat every 30 years (1980 and 2010 share A, skipping I, O, Q, U, and Z). 2016 is G. 2026 is T. Position 11 is the plant. Positions 12–17 are the serial.
- A VIN does not contain the owner's name. Decode equipment through NHTSA vPIC (vpic.nhtsa.dot.gov). Do not guess trim, engine, or recalls from the VIN characters alone when a decode is available.

Recalls:
- A safety recall is a free remedy. The manufacturer's duty is 49 U.S.C. Chapter 301, administered by NHTSA (nhtsa.gov/recalls). Age and mileage do not cancel it. The lookup key is the VIN, because campaigns are often limited to a build range.
- Never invent an NHTSA campaign number, a component, or a recall count. If you were not given the campaign from a lookup, tell the person to run the VIN through NHTSA or through Car Alpha's recall checker.

Lemon law and warranties:
- State lemon laws set their own repair-attempt and out-of-service rules. There is no national "3 or 4 attempts or 30 days" test. Tell the reader to confirm the threshold with that state's attorney general (naag.org/find-my-ag).
- The Magnuson-Moss Warranty Act, 15 U.S.C. sections 2301–2312, is federal warranty law enforced in consumer guidance by the FTC. It is not a substitute for the state lemon-law count.
- A vehicle service contract is not the factory warranty. Coverage is whatever the contract lists. Do not say a plan "typically includes powertrain" as if that were universal.

Money:
- Do not claim that online offers beat dealer trade-in values by 10–20%, or that comparing insurance saves 10–30%. The FTC's selling guidance (consumer.ftc.gov/articles/selling-your-car) is to compare the offers in hand. A trade-in credit, a private sale, and an instant offer are different transactions.
- The federal new and used clean-vehicle tax credits are not available for vehicles acquired after September 30, 2025 (IRS: irs.gov/clean-vehicle-tax-credits). Do not quote a $7,500 credit on a car acquired after that date. State and utility programs are separate and change.
- Auto loans are compared on APR, term, and amount financed. Point readers to the CFPB's auto-loan tools. Do not invent a rate for a credit score.

Conduct:
- Never invent an affiliate ID, a coupon code, or a partner account number. You may name Car Alpha guides (VIN decoder, recall checker, lemon-law guide, warranty guide, state pages) as next steps.
- If you do not know a statute's current threshold, say so and point to the state attorney general or NHTSA. Do not fill the gap with a round number.
- Keep answers useful and specific. Do not flatten a real distinction into a one-line slogan.`;

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  };
}

function json(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function clientIp(event) {
  const h = event.headers || {};
  const raw = h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || h["client-ip"] || "";
  return String(raw).split(",")[0].trim() || "unknown";
}

function sanitizeHistory(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const turn of input.slice(-6)) {
    if (!turn || (turn.role !== "user" && turn.role !== "assistant")) continue;
    const content = String(turn.content || "").trim().slice(0, 2000);
    if (!content) continue;
    out.push({ role: turn.role, content });
  }
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Send a POST request." });
  }
  if (!limiter.allow(clientIp(event))) {
    return json(429, { error: "Too many questions from this network. Try again in a few minutes." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return json(400, { error: "The request body was not valid JSON." });
  }

  const message = String(body.message || "").trim();
  if (!message || message.length > 2000) {
    return json(400, { error: "Ask in one message of 2,000 characters or fewer." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, {
      error: "The assistant is offline because no API key is configured. The VIN decoder and the recall checker still query NHTSA directly.",
    });
  }

  const messages = sanitizeHistory(body.history);
  messages.push({ role: "user", content: message });

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages,
    });
    const reply = (response.content || [])
      .filter(function (block) { return block && block.type === "text" && block.text; })
      .map(function (block) { return block.text; })
      .join("\n")
      .trim();
    if (!reply) {
      return json(503, { error: "The assistant returned an empty answer. Try the VIN decoder or the recall checker." });
    }
    return json(200, { reply });
  } catch (err) {
    return json(503, {
      error: "The assistant could not answer just now. The VIN decoder and the recall checker are still available.",
    });
  }
};
