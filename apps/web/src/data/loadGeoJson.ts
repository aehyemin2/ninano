import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import landTopologyJson from "world-atlas/land-110m.json";

export type GeoPosition = [longitude: number, latitude: number];

export interface LandBoundaries {
  rings: GeoPosition[][];
}

interface GeometryLike {
  type: string;
  coordinates?: unknown;
  geometries?: GeometryLike[];
}

interface FeatureLike {
  type: "Feature";
  geometry: GeometryLike | null;
}

interface FeatureCollectionLike {
  type: "FeatureCollection";
  features: FeatureLike[];
}

const topology = landTopologyJson as unknown as Topology<{ land: GeometryCollection }>;
let cachedBoundaries: LandBoundaries | null = null;

function isPosition(value: unknown): value is GeoPosition {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === "number" && typeof value[1] === "number";
}

function collectGeometry(geometry: GeometryLike | null, rings: GeoPosition[][]): void {
  if (!geometry) return;
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    for (const ring of geometry.coordinates) {
      if (Array.isArray(ring)) {
        const positions = ring.filter(isPosition);
        if (positions.length > 1) rings.push(positions);
      }
    }
    return;
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    for (const polygon of geometry.coordinates) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) {
        if (Array.isArray(ring)) {
          const positions = ring.filter(isPosition);
          if (positions.length > 1) rings.push(positions);
        }
      }
    }
    return;
  }
  geometry.geometries?.forEach((child) => collectGeometry(child, rings));
}

export function loadLandBoundaries(): LandBoundaries {
  if (cachedBoundaries) return cachedBoundaries;
  const converted = feature(topology, topology.objects.land) as unknown as FeatureLike | FeatureCollectionLike;
  const rings: GeoPosition[][] = [];
  if (converted.type === "FeatureCollection") {
    converted.features.forEach((item) => collectGeometry(item.geometry, rings));
  } else {
    collectGeometry(converted.geometry, rings);
  }
  cachedBoundaries = { rings };
  return cachedBoundaries;
}
