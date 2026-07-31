type PhotonFeature = {
  properties?: Record<string, unknown>;
};

const BIAS = { lat: "26.71", lon: "-80.09" };
const FL_BBOX = "-87.65,24.4,-79.8,31.1";

// Same-origin proxy for every web address field. Photon is reliable from the
// server, while direct browser requests can be blocked by privacy settings,
// content blockers, or provider CORS changes and previously failed silently.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 160) {
    return Response.json({ features: [] });
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lat", BIAS.lat);
  url.searchParams.set("lon", BIAS.lon);
  url.searchParams.set("bbox", FL_BBOX);
  url.searchParams.append("layer", "house");
  url.searchParams.append("layer", "street");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return Response.json({ features: [] }, { status: 502 });

    const body = (await response.json()) as { features?: PhotonFeature[] };
    const features = (body.features ?? []).slice(0, 6).map((feature) => ({
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
