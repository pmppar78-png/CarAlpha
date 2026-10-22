import type { Context } from "@netlify/functions";

const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const RECALL_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle";

interface DecodeResult {
  vehicle: Record<string, string>;
  recalls: Array<Record<string, string>>;
  recallCount: number;
  checkDigitValid: boolean;
}

// Only our own site (caralpha.org) and Car Alpha's own Netlify deploys/previews may call this endpoint.
const ALLOWED_ORIGIN = /^https:\/\/((www\.)?caralpha\.org|([a-z0-9-]+--)?caralpha\.netlify\.app)$/;
function requestOrigin(req: Request): string {
  const o = req.headers.get("origin");
  if (o) return o;
  const ref = req.headers.get("referer");
  if (ref) { try { return new URL(ref).origin; } catch { /* ignore */ } }
  return "";
}
function isAllowedOrigin(req: Request): boolean {
  return ALLOWED_ORIGIN.test(requestOrigin(req));
}

// Simple in-memory rate limiting (per IP, 30 lookups per minute)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);
  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return false;
  }
  if (limit.count >= 30) return true;
  limit.count++;
  return false;
}

const TRANSLIT: Record<string, number> = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
export function vinCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    sum += (/\d/.test(c) ? Number(c) : TRANSLIT[c]) * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAllowedOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (isRateLimited(context.ip || "unknown")) {
    return new Response(
      JSON.stringify({ error: "Too many lookups. Please wait a minute and try again." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
    );
  }

  const url = new URL(req.url);
  const vin = (url.searchParams.get("vin") || "").toUpperCase().replace(/[\s-]/g, "");

  if (!vin || vin.length !== 17) {
    return new Response(
      JSON.stringify({ error: `VINs have exactly 17 characters (this one has ${vin.length}).` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate VIN characters (no I, O, Q)
  if (/[IOQ]/i.test(vin) || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return new Response(
      JSON.stringify({ error: "Invalid VIN format. VINs cannot contain I, O, or Q." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Decode VIN
    const decodeUrl = `${NHTSA_BASE}/DecodeVinValuesExtended/${vin}?format=json`;
    const decodeRes = await fetch(decodeUrl);

    if (!decodeRes.ok) {
      throw new Error(`NHTSA API returned ${decodeRes.status}`);
    }

    const decodeData = await decodeRes.json();
    const decoded = decodeData.Results?.[0] || {};

    // Extract key fields
    const vehicle: Record<string, string> = {};
    const fields = [
      "Make", "Model", "ModelYear", "Trim", "BodyClass", "DriveType",
      "EngineConfiguration", "EngineCylinders", "DisplacementL",
      "FuelTypePrimary", "TransmissionStyle", "PlantCity", "PlantCountry",
      "PlantState", "VehicleType", "GVWR", "BrakeSystemType",
      "AirBagLocFront", "AirBagLocSide", "TPMS",
    ];

    for (const field of fields) {
      if (decoded[field] && String(decoded[field]).trim() !== "") {
        vehicle[field] = String(decoded[field]).trim();
      }
    }
    vehicle.VIN = vin;

    // Fetch recalls if we have make/model/year
    let recalls: Array<Record<string, string>> = [];
    let recallCount = 0;

    if (vehicle.Make && vehicle.Model && vehicle.ModelYear) {
      try {
        const recallUrl = `${RECALL_BASE}?make=${encodeURIComponent(vehicle.Make)}&model=${encodeURIComponent(vehicle.Model)}&modelYear=${encodeURIComponent(vehicle.ModelYear)}`;
        const recallRes = await fetch(recallUrl);

        if (recallRes.ok) {
          const recallData = await recallRes.json();
          if (recallData.results && Array.isArray(recallData.results)) {
            recalls = recallData.results.map((r: Record<string, string>) => ({
              component: r.Component || "",
              summary: r.Summary || "",
              consequence: r.Conequence || r.Consequence || "",
              remedy: r.Remedy || "",
              campaignNumber: r.NHTSACampaignNumber || "",
              reportDate: r.ReportReceivedDate || "",
            }));
            recallCount = recallData.results.length;
          }
        }
      } catch {
        // Recall API failure is non-fatal
      }
    }

    const checkDigitValid = vinCheckDigit(vin) === vin[8];
    const result: DecodeResult = { vehicle, recalls, recallCount, checkDigitValid };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("VIN Decode Error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to decode VIN. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/vin-decode",
};
