import type { Context } from "@netlify/functions";

const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const RECALL_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle";

interface DecodeResult {
  vehicle: Record<string, string>;
  recalls: Array<Record<string, string>>;
  recallCount: number;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const vin = (url.searchParams.get("vin") || "").trim().toUpperCase();

  if (!vin || vin.length !== 17) {
    return new Response(
      JSON.stringify({ error: "Please provide a valid 17-character VIN" }),
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

    const result: DecodeResult = { vehicle, recalls, recallCount };

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
