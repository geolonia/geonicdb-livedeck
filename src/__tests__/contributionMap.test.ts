import { describe, expect, it } from "vitest";
import { buildFeatureCollection, entityToFeature } from "../demos/contributionMap";

function entity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "urn:ngsi-ld:Contribution:abc123",
    type: "Contribution",
    origin: { type: "Property", value: "広島県" },
    specialty: { type: "Property", value: "お好み焼き" },
    seeded: { type: "Property", value: false },
    submittedAt: { type: "Property", value: "2026-09-03T04:30:00Z" },
    ...overrides,
  };
}

describe("entityToFeature", () => {
  it("converts a Contribution entity into a GeoJSON point feature", () => {
    const f = entityToFeature(entity());
    expect(f).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [132.4596, 34.3963] },
      properties: {
        id: "urn:ngsi-ld:Contribution:abc123",
        origin: "広島県",
        specialty: "お好み焼き",
        seeded: false,
      },
    });
  });

  it("marks seeded=true entries so the caller can render them distinctly", () => {
    const f = entityToFeature(entity({ seeded: { type: "Property", value: true } }));
    expect(f?.properties.seeded).toBe(true);
  });

  it("defaults seeded to false when the attribute is missing (never treat unknown as seeded)", () => {
    const { seeded: _drop, ...rest } = entity();
    const f = entityToFeature(rest);
    expect(f?.properties.seeded).toBe(false);
  });

  it("returns null when origin cannot be resolved to coordinates, instead of fabricating a point", () => {
    const f = entityToFeature(entity({ origin: { type: "Property", value: "未知の場所" } }));
    expect(f).toBeNull();
  });

  it("returns null when the entity has no id", () => {
    const { id: _drop, ...rest } = entity();
    expect(entityToFeature(rest)).toBeNull();
  });
});

describe("buildFeatureCollection", () => {
  it("converts a list of entities, silently dropping ones with unresolvable origin", () => {
    const fc = buildFeatureCollection([
      entity({ id: "urn:ngsi-ld:Contribution:a" }),
      entity({ id: "urn:ngsi-ld:Contribution:b", origin: { type: "Property", value: "謎" } }),
    ]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties.id).toBe("urn:ngsi-ld:Contribution:a");
  });

  it("returns an empty FeatureCollection for an empty list (no fabricated data)", () => {
    expect(buildFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
