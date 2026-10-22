/* Result next steps for VIN and recall tools.
   At most two links. An affiliate link is labeled. */
(function () {
  function card(item) {
    var rel = item.external ? ' rel="nofollow sponsored noopener" target="_blank"' : "";
    var note = item.disclosure
      ? '<p class="mt-2 text-[10px] text-silver-500/70">Affiliate link. We may earn a commission at no cost to you.</p>'
      : "";
    return (
      '<a href="' + item.href + '"' + rel + ' class="glass-card metallic-border rounded-xl p-4 carbon-panel block">' +
      '<div class="font-bold text-white text-sm">' + item.title + "</div>" +
      '<p class="text-xs text-silver-400 mt-1 leading-relaxed">' + item.text + "</p>" +
      note +
      "</a>"
    );
  }

  function choose(opts) {
    var year = parseInt(opts && opts.year, 10);
    var recalls = opts && opts.recallCount ? Number(opts.recallCount) : 0;
    if (recalls > 0) {
      return [
        {
          href: "/guides/lemon-law/",
          title: "If the same defect keeps coming back",
          text: "A recall repair is free. A lemon-law claim is a separate state rule about a defect the manufacturer did not fix. Read the guide, then confirm the repair-attempt threshold with your state attorney general.",
        },
        {
          href: "/blog/understanding-vehicle-recalls/",
          title: "How to get the free repair",
          text: "Schedule it at a franchised dealer of that make. The remedy is required under federal law whether or not any warranty is still in force. Take the campaign printout with you.",
        },
      ];
    }
    if (year && year <= 2017) {
      return [
        {
          href: "/guides/warranties/",
          title: "Factory coverage is probably over",
          text: "A " + year + " model is old enough that the original warranty has usually expired. Read what a service contract actually covers before you pay for one, and keep the exclusion list.",
        },
        {
          href: "/go/warranty/",
          external: true,
          disclosure: true,
          title: "Compare a service contract",
          text: "If you want quotes, compare the obligor and the exclusions. The guide on the left is the part to read first.",
        },
      ];
    }
    return [
      {
        href: "/guides/how-to-check-car-before-buying/",
        title: "What to verify before you buy",
        text: "Match the VIN to the title, read the recall result you just pulled, and inspect the car. The checklist is the longer version of that sequence.",
      },
      {
        href: "/guides/safety/",
        title: "Ratings are a different question",
        text: "NHTSA stars and IIHS scores describe the design. They do not say whether this car’s open campaigns are done. The safety hub separates the two.",
      },
    ];
  }

  window.caShowNextSteps = function (el, opts) {
    if (!el) return;
    var items = choose(opts || {}).slice(0, 2);
    el.innerHTML =
      '<div class="glass-card metallic-border rounded-2xl p-5 carbon-panel">' +
      '<h3 class="font-bold text-white text-base mb-3">What to do next</h3>' +
      '<div class="grid sm:grid-cols-2 gap-3">' + items.map(card).join("") + "</div>" +
      "</div>";
    el.classList.remove("hidden");
  };
})();
