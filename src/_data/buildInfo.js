// Sitemap lastmod for generated URLs. This is the date the build actually ran,
// not a date frozen in the template.
module.exports = function () {
  const generatedAt = new Date();
  const lastmod = generatedAt.toISOString().slice(0, 10);
  return { lastmod, generatedAt: generatedAt.toISOString() };
};
