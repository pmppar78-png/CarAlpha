const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  // ───────────────────────────────────────────────
  // CUSTOM FILTERS
  // ───────────────────────────────────────────────

  // slug — URL-safe slug from any string
  eleventyConfig.addFilter("slug", function (str) {
    if (!str) return "";
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  // dateFormat — format ISO date strings using Luxon
  eleventyConfig.addFilter("dateFormat", function (dateObj, format) {
    if (!dateObj) return "";
    const fmt = format || "LLLL d, yyyy";
    if (dateObj instanceof Date) {
      return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(fmt);
    }
    return DateTime.fromISO(String(dateObj), { zone: "utc" }).toFormat(fmt);
  });

  // jsonStringify — safe JSON output for JSON-LD
  eleventyConfig.addFilter("jsonStringify", function (value) {
    return JSON.stringify(value, null, 2);
  });

  // limit — return first N items from array
  eleventyConfig.addFilter("limit", function (arr, count) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, count);
  });

  // where — filter array of objects by key/value
  eleventyConfig.addFilter("where", function (arr, key, value) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (item) {
      return item && item[key] === value;
    });
  });

  // toLocaleString — format numbers with commas
  eleventyConfig.addFilter("toLocaleString", function (value) {
    if (!value) return "0";
    return Number(value).toLocaleString();
  });

  // getMakeName — look up make name from a model object
  eleventyConfig.addFilter("getMakeName", function (model) {
    if (!model) return "";
    return model.makeName || model.makeSlug || "";
  });

  // group_by — group array of objects by a key
  eleventyConfig.addFilter("group_by", function (arr, key) {
    if (!Array.isArray(arr)) return {};
    var groups = {};
    arr.forEach(function (item) {
      var groupKey = item && item[key] ? String(item[key]) : "other";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });
    return groups;
  });

  // ───────────────────────────────────────────────
  // COLLECTIONS
  // ───────────────────────────────────────────────

  eleventyConfig.addCollection("makes", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/makes/**/*.{njk,md}").sort(function (a, b) {
      return (a.data.title || "").localeCompare(b.data.title || "");
    });
  });

  eleventyConfig.addCollection("models", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/makes/**/models/**/*.{njk,md}").sort(function (a, b) {
      return (a.data.title || "").localeCompare(b.data.title || "");
    });
  });

  eleventyConfig.addCollection("states", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/states/**/*.{njk,md}").sort(function (a, b) {
      return (a.data.title || "").localeCompare(b.data.title || "");
    });
  });

  eleventyConfig.addCollection("guides", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/guides/**/*.{njk,md}").sort(function (a, b) {
      var dateA = a.date || new Date(0);
      var dateB = b.date || new Date(0);
      return dateB - dateA;
    });
  });

  eleventyConfig.addCollection("learn", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/learn/**/*.{njk,md}").sort(function (a, b) {
      var orderA = a.data.order || 999;
      var orderB = b.data.order || 999;
      return orderA - orderB;
    });
  });

  eleventyConfig.addCollection("blog", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/blog/**/*.{njk,md}").sort(function (a, b) {
      var dateA = a.date || new Date(0);
      var dateB = b.date || new Date(0);
      return dateB - dateA;
    });
  });

  eleventyConfig.addCollection("recalls", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/recalls/**/*.{njk,md}").sort(function (a, b) {
      var dateA = a.date || new Date(0);
      var dateB = b.date || new Date(0);
      return dateB - dateA;
    });
  });

  eleventyConfig.addCollection("tools", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/tools/**/*.{njk,md}").sort(function (a, b) {
      return (a.data.title || "").localeCompare(b.data.title || "");
    });
  });

  // ───────────────────────────────────────────────
  // SITEMAP COLLECTION (all pages)
  // ───────────────────────────────────────────────

  eleventyConfig.addCollection("sitemap", function (collectionApi) {
    return collectionApi.getAll().filter(function (item) {
      var url = item.url || "";
      if (url === false) return false;
      if (item.data && item.data.eleventyExcludeFromCollections) return false;
      if (item.data && item.data.noindex) return false;
      return url && !url.includes("/404") && !url.endsWith(".xml");
    });
  });

  // ───────────────────────────────────────────────
  // PASSTHROUGH COPY
  // ───────────────────────────────────────────────

  eleventyConfig.addPassthroughCopy("src/assets/css");
  eleventyConfig.addPassthroughCopy("src/assets/js");
  eleventyConfig.addPassthroughCopy("src/assets/images");
  eleventyConfig.addPassthroughCopy({ "src/assets/favicons": "/" });
  eleventyConfig.addPassthroughCopy("src/robots.txt");

  // ───────────────────────────────────────────────
  // BREADCRUMBS UNIVERSAL SHORTCODE
  // ───────────────────────────────────────────────

  eleventyConfig.addShortcode("breadcrumbs", function (items) {
    if (!items || !items.length) return "";

    var schemaItems = items.map(function (item, idx) {
      return {
        "@type": "ListItem",
        position: idx + 1,
        name: item.label,
        item: item.url ? "https://www.caralpha.com" + item.url : undefined,
      };
    });

    var schemaJson = JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: schemaItems,
      },
      null,
      2
    );

    var html = '<script type="application/ld+json">' + schemaJson + "</script>\n";
    html += '<nav aria-label="Breadcrumb" class="mb-6">\n';
    html += '  <ol class="flex flex-wrap items-center gap-1.5 text-sm text-silver-400">\n';

    items.forEach(function (item, idx) {
      var isLast = idx === items.length - 1;
      if (isLast) {
        html += '    <li class="text-volt-400 font-medium" aria-current="page">' + item.label + "</li>\n";
      } else {
        html +=
          '    <li><a href="' +
          item.url +
          '" class="hover:text-volt-400 transition-colors">' +
          item.label +
          "</a></li>\n";
        html +=
          '    <li aria-hidden="true"><svg class="w-3.5 h-3.5 text-silver-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></li>\n';
      }
    });

    html += "  </ol>\n";
    html += "</nav>";

    return html;
  });

  // ───────────────────────────────────────────────
  // TEMPLATE ENGINE SETTINGS
  // ───────────────────────────────────────────────

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html", "liquid"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
};
