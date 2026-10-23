"use strict";

/**
 * Indefinite article for a following word, using sound rather than the first
 * letter. Handles vowel-sound names (Audi, Infiniti, Escape), letter-codes
 * (F-150, CR-V, SUV), and numbers (an 8-year-old, a 2018).
 */

const LETTER_AN = new Set(["a", "e", "f", "h", "i", "l", "m", "n", "o", "r", "s", "x"]);

const SILENT_H = /^(hour|honest|honor|honour|heir|heiress|herb)s?\b/i;
const YOU_SOUND = /^(uni(que|versity|ted|on|form|t)|user|useful|useless|username|use[drs]?|usual|utility|utensil|european|euro|eucalyptus|eulogy|euphem|one|once)\b/i;

function isLetterCode(word) {
  const w = String(word || "").replace(/[’']/g, "");
  if (/^[A-Z]{2,6}$/.test(w)) return true;
  if (/^[A-Z]{1,3}-[A-Za-z0-9]/.test(w)) return true;
  if (/^[A-Z]{1,3}\.[A-Za-z0-9]/.test(w)) return true;
  if (/^[A-Z]\d/.test(w)) return true;
  return false;
}

function numberUsesAn(token) {
  const match = String(token).match(/^(\d+)/);
  if (!match) return false;
  const digits = match[1];
  const n = parseInt(digits, 10);
  if (digits.length === 4 && n >= 1000 && n <= 2099) {
    if (n >= 1100 && n <= 1199) return true;
    if (n >= 1800 && n <= 1899) return true;
    return false;
  }
  if (n === 8 || n === 11 || n === 18) return true;
  if (n >= 80 && n <= 89) return true;
  if (n >= 800 && n <= 899) return true;
  return false;
}

function articleFor(word) {
  const raw = String(word == null ? "" : word).trim().replace(/^[^A-Za-z0-9]+/, "");
  if (!raw) return "a";
  if (SILENT_H.test(raw)) return "an";
  if (YOU_SOUND.test(raw)) return "a";
  if (/^\d/.test(raw)) return numberUsesAn(raw) ? "an" : "a";
  if (isLetterCode(raw)) return LETTER_AN.has(raw[0].toLowerCase()) ? "an" : "a";
  return /^[aeiou]/i.test(raw) ? "an" : "a";
}

function caseArticle(sample, correct) {
  if (sample === sample.toUpperCase()) return correct.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return correct[0].toUpperCase() + correct.slice(1);
  return correct;
}

function fixArticles(text) {
  return String(text == null ? "" : text).replace(
    /\b(an?)(\s+)([A-Za-z0-9][A-Za-z0-9.'’-]*)/gi,
    function (_m, art, space, word) {
      return caseArticle(art, articleFor(word)) + space + word;
    }
  );
}

module.exports = { articleFor, fixArticles };
