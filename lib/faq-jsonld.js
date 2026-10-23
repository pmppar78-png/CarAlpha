"use strict";

/**
 * Rebuild FAQPage JSON-LD from the visible FAQ markup so the structured
 * answer is the same string a reader sees.
 */

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_m, n) { return String.fromCharCode(Number(n)); });
}

function textContent(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|li|div|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function withoutEmbedded(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

function sliceBalanced(html, start, tag) {
  const open = new RegExp("<" + tag + "\\b", "gi");
  const close = new RegExp("</" + tag + ">", "gi");
  open.lastIndex = start;
  let depth = 1;
  let cursor = start;
  while (depth > 0) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return html.length;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) return nextClose.index;
    }
  }
  return html.length;
}

function extractVisibleFaqs(html) {
  const source = withoutEmbedded(html);
  const faqs = [];

  const itemRe = /<div\b[^>]*class="[^"]*\bfaq-item\b[^"]*"[^>]*>/gi;
  let match;
  while ((match = itemRe.exec(source))) {
    const innerStart = match.index + match[0].length;
    const innerEnd = sliceBalanced(source, innerStart, "div");
    const inner = source.slice(innerStart, innerEnd);
    const heading = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (!heading) continue;
    const question = textContent(heading[1]);
    const answerHtml = inner.replace(heading[0], " ");
    const answer = textContent(answerHtml);
    if (question && answer) faqs.push({ q: question, a: answer });
    itemRe.lastIndex = innerEnd;
  }

  const detailsRe = /<details\b[^>]*>/gi;
  while ((match = detailsRe.exec(source))) {
    const innerStart = match.index + match[0].length;
    const innerEnd = sliceBalanced(source, innerStart, "details");
    const inner = source.slice(innerStart, innerEnd);
    const summary = inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (!summary) continue;
    const question = textContent(summary[1]);
    const answer = textContent(inner.replace(summary[0], " "));
    if (question && answer) faqs.push({ q: question, a: answer });
    detailsRe.lastIndex = innerEnd;
  }

  if (!faqs.length) {
    // Headed FAQ sections: <h2 id="faq"> or <section id="faq">, then <h3> question
    // followed by its answer paragraphs, ending at the next h2/h3 or section end.
    const startRe = /<(h2|section)\b[^>]*\bid="faq"[^>]*>/i;
    const start = source.match(startRe);
    if (start) {
      let rest = source.slice(start.index + start[0].length);
      if (start[1].toLowerCase() === "h2") rest = rest.replace(/^[\s\S]*?<\/h2>/i, "");
      else rest = rest.replace(/^\s*<h2\b[^>]*>[\s\S]*?<\/h2>/i, "");
      const end = rest.search(/<\/section>|<h2\b|<\/main>|<\/article>|<aside\b|<nav\b|<footer\b|<div\b|<\/div>/i);
      const block = end === -1 ? rest : rest.slice(0, end);
      const parts = block.split(/(?=<h3\b)/i);
      for (const part of parts) {
        const heading = part.match(/^<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
        if (!heading) continue;
        const question = textContent(heading[1]);
        const answer = textContent(part.slice(heading[0].length));
        if (question && answer) faqs.push({ q: question, a: answer });
      }
    }
  }

  return faqs;
}

function faqPageScript(faqs) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(function (faq) {
      return {
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      };
    }),
  };
  return '<script type="application/ld+json">' + JSON.stringify(schema) + "</script>";
}

function isFaqPageScript(block) {
  return /"@type"\s*:\s*"FAQPage"/.test(block);
}

function applyFaqJsonLd(html) {
  const faqs = extractVisibleFaqs(html);
  const stripped = String(html).replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, function (block) {
    return isFaqPageScript(block) ? "" : block;
  });
  // FAQPage markup is only allowed for questions a reader can see on the page.
  if (!faqs.length) return stripped;
  const script = faqPageScript(faqs);
  if (stripped.includes("</body>")) return stripped.replace("</body>", script + "\n</body>");
  return stripped + script;
}

function faqMismatches(html) {
  const visible = extractVisibleFaqs(html);
  if (!visible.length) return [];
  const visibleText = visible.map(function (faq) { return faq.a; });
  const mismatches = [];
  const re = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    if (!isFaqPageScript(match[1])) continue;
    let data;
    try { data = JSON.parse(match[1]); } catch (_err) { continue; }
    const entities = data.mainEntity || [];
    for (const entity of entities) {
      const text = entity && entity.acceptedAnswer && entity.acceptedAnswer.text;
      if (!text) continue;
      if (visibleText.indexOf(text) === -1) mismatches.push(text);
    }
  }
  return mismatches;
}

module.exports = { extractVisibleFaqs, applyFaqJsonLd, faqMismatches, textContent };
