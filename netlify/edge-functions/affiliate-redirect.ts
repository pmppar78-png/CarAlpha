import type { Context } from "https://edge.netlify.com";

// Affiliate partner configuration
// All affiliate links route through /go/{partner}/ for tracking and easy partner swapping
const AFFILIATE_PARTNERS: Record<string, { url: string; name: string }> = {
  insurance: {
    url: "https://www.thezebra.com/",
    name: "The Zebra",
  },
  warranty: {
    url: "https://www.endurancewarranty.com/",
    name: "Endurance",
  },
  loans: {
    url: "https://www.lendingtree.com/auto/",
    name: "LendingTree Auto",
  },
  refinance: {
    url: "https://www.lendingtree.com/auto/refinance/",
    name: "LendingTree Refi",
  },
  sell: {
    url: "https://www.carvana.com/sell-my-car",
    name: "Carvana",
  },
  repair: {
    url: "https://repairpal.com/estimator",
    name: "RepairPal",
  },
  "lemon-law": {
    url: "https://www.lemonlawexperts.com/",
    name: "Lemon Law Experts",
  },
  "ev-charger": {
    url: "https://www.chargepoint.com/",
    name: "ChargePoint",
  },
  carfax: {
    url: "https://www.carfax.com/",
    name: "Carfax",
  },
  mechanics: {
    url: "https://www.yourmechanic.com/",
    name: "YourMechanic",
  },
};

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.replace(/^\/go\//, "").replace(/\/$/, "").split("/");
  const partnerKey = pathParts[0];

  const partner = AFFILIATE_PARTNERS[partnerKey];

  if (!partner) {
    // Unknown partner — redirect to homepage
    return Response.redirect(new URL("/", request.url).toString(), 302);
  }

  // Build the redirect URL with tracking parameters
  let redirectUrl = partner.url;
  const ref = url.searchParams.get("ref") || "direct";
  const vin = url.searchParams.get("vin") || "";
  const make = url.searchParams.get("make") || "";
  const model = url.searchParams.get("model") || "";
  const state = url.searchParams.get("state") || "";

  // Append UTM parameters for tracking
  const separator = redirectUrl.includes("?") ? "&" : "?";
  redirectUrl += `${separator}utm_source=caralpha&utm_medium=referral&utm_campaign=${partnerKey}&utm_content=${ref}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "no-cache, no-store",
      "Referrer-Policy": "no-referrer-when-downgrade",
    },
  });
};

export const config = {
  path: "/go/*",
};
