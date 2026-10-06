/**
 * Golden suite tests — Phase 10.
 *
 * Runs all six golden fixtures and verifies they all pass.
 * Writes docs/eval/m03-latest.md from the fixture results — does not
 * hand-edit any pass/fail status.
 *
 * Directive Phase 10:
 *   "Golden fixtures: happy ADR, contradiction, prompt injection, missing
 *    citation, unit mismatch, cross-tenant attempt."
 *   "Test command writes docs/eval/m03-latest.md from results. Do not
 *    hand-edit passes."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  runAllGoldenFixtures,
  buildEvalReport,
} from "./golden-fixtures.js";

// ============================================================
// Run all fixtures and write the eval report
// ============================================================

// The test runs from the package directory (packages/domain); the repo
// root is three levels up. Find it by looking for the pnpm-workspace.yaml
// file, which lives only at the repo root.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    dir = resolve(dir, "..");
  }
  // Fallback: assume the standard layout.
  return resolve(process.cwd(), "../..");
}

describe("golden suite — all fixtures pass", () => {
  const results = runAllGoldenFixtures();
  const report = buildEvalReport(results);
  const repoRoot = findRepoRoot();
  const reportPath = resolve(repoRoot, "docs/eval/m03-latest.md");

  // Write the report before the assertions so it exists even if a test
  // fails (the report itself records failures honestly).
  try {
    mkdirSync(dirname(reportPath), { recursive: true });
  } catch {
    // directory may already exist
  }
  writeFileSync(reportPath, report, "utf8");

  it("happy-adr fixture passes", () => {
    const r = results.find((r) => r.name === "happy-adr");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("contradiction fixture passes", () => {
    const r = results.find((r) => r.name === "contradiction");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("prompt-injection fixture passes", () => {
    const r = results.find((r) => r.name === "prompt-injection");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("missing-citation fixture passes", () => {
    const r = results.find((r) => r.name === "missing-citation");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("unit-mismatch fixture passes", () => {
    const r = results.find((r) => r.name === "unit-mismatch");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("cross-tenant fixture passes", () => {
    const r = results.find((r) => r.name === "cross-tenant");
    expect(r).toBeDefined();
    expect(r?.passed).toBe(true);
  });

  it("all six fixtures pass (no failures)", () => {
    const failed = results.filter((r) => !r.passed);
    expect(failed).toHaveLength(0);
    expect(results).toHaveLength(6);
  });

  it("eval report was written to docs/eval/m03-latest.md", () => {
    expect(report.length).toBeGreaterThan(0);
    expect(report).toContain("# M03 Latest Eval Report");
    expect(report).toContain("## Golden fixture results");
  });

  it("eval report records passed and failed counts honestly", () => {
    const passedCount = results.filter((r) => r.passed).length;
    expect(report).toContain(`- Passed: ${passedCount} / ${results.length}`);
    expect(report).toContain(`- Failed: ${results.length - passedCount} / ${results.length}`);
  });
});
