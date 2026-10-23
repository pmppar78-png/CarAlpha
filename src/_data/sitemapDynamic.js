// Sitemap entries for edge-rendered deep pages.
// make/in/state and model/in/state pages are served by the vehicle-pages edge
// function with noindex,follow until they carry model-specific state data, and
// model-year/in/state pages are near-duplicates, so none of them are listed.

module.exports = function () {
  return [];
};
