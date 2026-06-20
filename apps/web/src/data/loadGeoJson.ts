export interface GeoJsonGeometry {
  type: "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: GeoJsonGeometry }>;
}

export async function loadGeoJson(url = "/data/world.geojson") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GeoJSON request failed: ${response.status}`);
  return response.json() as Promise<GeoJsonFeatureCollection>;
}
