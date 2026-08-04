type PhotonFeature = {
  properties?: Record<string, unknown>;
};

const BIAS = { lat: "26.71", lon: "-80.09" };
const FL_BBOX = "-87.65,24.4,-79.8,31.1";

async function photonSearch(query: string): Promise<PhotonFeature[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lat", BIAS.lat);
  url.searchParams.set("lon", BIAS.lon);
  url.searchParams.set("bbox", FL_BBOX);
  url.searchParams.append("layer", "house");
  url.searchParams.append("layer", "street");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

// Same-origin proxy for every web address field. Photon is reliable from the
// server, while direct browser requests can be blocked by privacy settings,
// content blockers, or provider CORS changes and previously failed silently.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 160) {
    return Response.json({ features: [] });
  }

  try {
    const exact = await photonSearch(query);
    // Photon has the Palm Beach street network but frequently has no rooftop
    // row for a specific house number. Searching the street fragment as well
    // lets the client restore the number the owner already typed.
    const streetQuery = query.replace(/^\s*\d+[a-zA-Z-]*\s+/, "").trim();
    const street = streetQuery !== query && streetQuery.length >= 3
      ? await photonSearch(streetQuery)
      : [];
    const seen = new Set<string>();
    const features = [...exact, ...street]
      .filter((feature) => {
        const props = feature.properties ?? {};
        const key = `${String(props.osm_type ?? "")}:${String(props.osm_id ?? "")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6)
      .map((feature) => ({
      properties: feature.properties ?? {},
      }));
    return Response.json(
      { features },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" } },
    );
  } catch {
    return Response.json({ features: [] }, { status: 502 });
  }
}
