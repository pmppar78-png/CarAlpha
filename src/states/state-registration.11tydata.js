"use strict";

// Breadcrumbs are computed here, per paginated state, because a YAML
// eleventyComputed array was evaluated once and showed "Alabama" on every page.
module.exports = {
  eleventyComputed: {
    breadcrumbs: (data) => data.state ? [
      { label: "Home", url: "/" },
      { label: "States", url: "/states/" },
      { label: data.state.name, url: `/states/${data.state.slug}/` },
      { label: "Registration" }
    ] : []
  }
};
