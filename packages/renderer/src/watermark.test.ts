/**
 * Unit tests for packages/renderer/src/watermark.ts — watermark builder.
 *
 * Covers:
 *   - buildWatermark constructs a valid Watermark with all four fields.
 *   - statusLine is the exact directive string.
 *   - buildId is generated when omitted; used when supplied.
 *   - Validation rejects invalid inputs (bad UUID, missing fields).
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { buildWatermark } from "./watermark.js";

const BASE_UUID = "00000000-0000-4000-8000-000000000000";
const BUILD_TIME = "2026-10-06T12:00:00.000Z";

describe("buildWatermark", () => {
  it("constructs a watermark with all four metadata fields", () => {
    const wm = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildId:          BASE_UUID,
      buildTime:        BUILD_TIME,
    });
    expect(wm.tenantId).toBe(BASE_UUID);
    expect(wm.artifactVersion).toBe(1);
    expect(wm.buildId).toBe(BASE_UUID);
    expect(wm.buildTime).toBe(BUILD_TIME);
  });

  it("sets the exact statusLine per H02", () => {
    const wm = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildId:          BASE_UUID,
      buildTime:        BUILD_TIME,
    });
    expect(wm.statusLine).toBe("Enterprise Candidate  -  Active Development");
  });

  it("generates a buildId when omitted", () => {
    const wm = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildTime:        BUILD_TIME,
    });
    expect(wm.buildId).toBeDefined();
    expect(wm.buildId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("uses the supplied buildId when provided", () => {
    const wm = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 2,
      buildId:          "11111111-1111-4111-8111-111111111111",
      buildTime:        BUILD_TIME,
    });
    expect(wm.buildId).toBe("11111111-1111-4111-8111-111111111111");
    expect(wm.artifactVersion).toBe(2);
  });

  it("is deterministic when buildId is supplied", () => {
    const a = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildId:          BASE_UUID,
      buildTime:        BUILD_TIME,
    });
    const b = buildWatermark({
      tenantId:        BASE_UUID,
      artifactVersion: 1,
      buildId:          BASE_UUID,
      buildTime:        BUILD_TIME,
    });
    expect(a).toEqual(b);
  });

  it("rejects an invalid tenantId", () => {
    expect(() =>
      buildWatermark({
        tenantId:        "not-a-uuid",
        artifactVersion: 1,
        buildId:          BASE_UUID,
        buildTime:        BUILD_TIME,
      }),
    ).toThrow();
  });

  it("rejects a non-positive artifactVersion", () => {
    expect(() =>
      buildWatermark({
        tenantId:        BASE_UUID,
        artifactVersion: 0,
        buildId:          BASE_UUID,
        buildTime:        BUILD_TIME,
      }),
    ).toThrow();
  });

  it("rejects a missing buildTime", () => {
    expect(() =>
      buildWatermark({
        tenantId:        BASE_UUID,
        artifactVersion: 1,
        buildId:          BASE_UUID,
        buildTime:        "not-a-date",
      }),
    ).toThrow();
  });
});
