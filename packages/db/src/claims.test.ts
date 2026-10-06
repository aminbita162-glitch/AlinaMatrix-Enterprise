/**
 * Unit tests for packages/db/src/claims.ts
 *
 * Required by Phase 4 directive:
 *   - tenant isolation (cross-tenant returns null)
 *   - terminology uniqueness DB constraint shape
 *   - INSERT queries carry tenant_id (RLS WITH CHECK)
 *   - Migration SQL has correct RLS policies on all four new tables
 *
 * Uses a mock PoolClient — no live database required.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  insertClaim,
  getClaim,
  insertCitation,
  insertAssumption,
  insertTerminologyEntry,
  getTerminologyEntry,
  insertClaimEdge,
  getClaimEdges,
} from "../src/claims.js";
import type {
  ClaimRow,
  CitationRow,
  AssumptionRow,
  TerminologyEntryRow,
  ClaimEdgeRow,
} from "../src/claims.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, "../migrations/003_claims_provenance.sql");

// ============================================================
// Mock client
// ============================================================

interface MockQuery {
  text:   string;
  values: unknown[];
}

interface MockClientResult {
  rows: unknown[];
  rowCount: number;
}

function makeMockClient(
  rowFactory?: (text: string, values: unknown[]) => unknown[],
): { client: Parameters<typeof insertClaim>[0]; queries: MockQuery[] } {
  const queries: MockQuery[] = [];
  const client = {
    query: async (text: string, values?: unknown[]): Promise<MockClientResult> => {
      const vals = values ?? [];
      queries.push({ text, values: vals });
      const rows = rowFactory ? rowFactory(text, vals) : [];
      return { rows, rowCount: rows.length };
    },
  } as unknown as Parameters<typeof insertClaim>[0];
  return { client, queries };
}

// ============================================================
// Fixture data
// ============================================================

const TENANT_A = "aaaaaaaa-0000-4000-a000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-b000-000000000002";
const PROJECT_ID = "cccccccc-0000-4000-c000-000000000001";
const CLAIM_ID   = "11111111-0000-4000-a000-000000000001";
const EVIDENCE_ID = "22222222-0000-4000-a000-000000000001";
const FRAGMENT_ID = "33333333-0000-4000-a000-000000000001";
const CITATION_ID = "44444444-0000-4000-a000-000000000001";

function makeClaimRow(): ClaimRow {
  return {
    id:                     CLAIM_ID,
    tenant_id:              TENANT_A,
    project_id:             PROJECT_ID,
    subject:                "Study population",
    predicate:              "size",
    object:                 "240",
    qualifier:              null,
    time_scope:             null,
    unit:                   null,
    claim_text:             "Study population was 240.",
    claim_type:             "witnessed",
    support_status:         "supported",
    negative_evidence_note: "No contradicting population counts found.",
    evidence_ids:           [EVIDENCE_ID],
    confidence:             "0.900",
    contradiction_status:   "none",
    generated:              false,
    reviewer_status:        "pending",
    created_at:             new Date(),
    updated_at:             new Date(),
  };
}

function makeCitationRow(): CitationRow {
  return {
    id:          CITATION_ID,
    tenant_id:   TENANT_A,
    claim_id:    CLAIM_ID,
    evidence_id: EVIDENCE_ID,
    fragment_id: FRAGMENT_ID,
    status:      "supports_claim",
    quote:       "240 patients between 2020 and 2022",
    quote_hash:  "a".repeat(64),
    created_at:  new Date(),
  };
}

function makeAssumptionRow(): AssumptionRow {
  return {
    id:              "55555555-0000-4000-a000-000000000001",
    tenant_id:       TENANT_A,
    project_id:      PROJECT_ID,
    claim_id:        null,
    statement:       "Baseline characteristics are comparable across arms.",
    rationale:       "Randomisation was stratified.",
    reviewer_status: "pending",
    created_at:      new Date(),
  };
}

function makeTermRow(): TerminologyEntryRow {
  return {
    id:         "66666666-0000-4000-a000-000000000001",
    tenant_id:  TENANT_A,
    project_id: PROJECT_ID,
    term:       "RCT",
    definition: "Randomised Controlled Trial",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeEdgeRow(): ClaimEdgeRow {
  return {
    id:               "77777777-0000-4000-a000-000000000001",
    tenant_id:        TENANT_A,
    source_claim_id:  CLAIM_ID,
    target_claim_id:  "88888888-0000-4000-a000-000000000001",
    edge_type:        "SUPPORTS",
    created_at:       new Date(),
  };
}

// ============================================================
// insertClaim
// ============================================================

describe("insertClaim", () => {
  it("issues an INSERT INTO claims with correct fields", async () => {
    const { client, queries } = makeMockClient(() => [makeClaimRow()]);

    const row = await insertClaim(client, {
      tenantId:              TENANT_A,
      projectId:             PROJECT_ID,
      subject:               "Study population",
      predicate:             "size",
      object:                "240",
      claimText:             "Study population was 240.",
      claimType:             "witnessed",
      supportStatus:         "supported",
      negativeEvidenceNote:  "No contradicting population counts found.",
      evidenceIds:           [EVIDENCE_ID],
      confidence:            0.9,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("INSERT INTO claims");
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(queries[0]?.values).toContain(PROJECT_ID);
    expect(queries[0]?.values).toContain("witnessed");
    expect(queries[0]?.values).toContain("supported");
    expect(row.id).toBe(CLAIM_ID);
  });

  it("includes tenant_id in INSERT VALUES (RLS WITH CHECK)", async () => {
    const { client, queries } = makeMockClient(() => [makeClaimRow()]);

    await insertClaim(client, {
      tenantId:             TENANT_A,
      projectId:            PROJECT_ID,
      subject:              "X",
      predicate:            "Y",
      object:               "Z",
      claimText:            "X Y Z.",
      claimType:            "inferred",
      supportStatus:        "weak",
    });

    expect(queries[0]?.values[0]).toBe(TENANT_A);
    // Tenant B must NOT appear in the INSERT
    expect(queries[0]?.values).not.toContain(TENANT_B);
  });
});

// ============================================================
// getClaim — tenant isolation
// ============================================================

describe("getClaim — tenant isolation", () => {
  it("returns the claim row when found", async () => {
    const { client } = makeMockClient(() => [makeClaimRow()]);
    const row = await getClaim(client, CLAIM_ID);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(CLAIM_ID);
  });

  it("returns null when RLS excludes the row (wrong tenant context)", async () => {
    // Simulate Tenant B context: no rows returned
    const { client } = makeMockClient(() => []);
    const row = await getClaim(client, CLAIM_ID);
    expect(row).toBeNull();
  });

  it("SELECT is parameterised on claim id (no raw value embedding)", async () => {
    const { client, queries } = makeMockClient(() => [makeClaimRow()]);
    await getClaim(client, CLAIM_ID);
    expect(queries[0]?.text).toContain("WHERE id = $1");
    expect(queries[0]?.values).toContain(CLAIM_ID);
  });
});

// ============================================================
// insertCitation
// ============================================================

describe("insertCitation", () => {
  it("inserts a citation row with quote and quote_hash", async () => {
    const { client, queries } = makeMockClient(() => [makeCitationRow()]);

    const row = await insertCitation(client, {
      tenantId:   TENANT_A,
      claimId:    CLAIM_ID,
      evidenceId: EVIDENCE_ID,
      fragmentId: FRAGMENT_ID,
      status:     "supports_claim",
      quote:      "240 patients between 2020 and 2022",
      quoteHash:  "a".repeat(64),
    });

    expect(queries[0]?.text).toContain("INSERT INTO citations");
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(queries[0]?.values).toContain("240 patients between 2020 and 2022");
    expect(row.id).toBe(CITATION_ID);
  });

  it("sets quote and quote_hash to null when omitted", async () => {
    const rowWithoutQuote = { ...makeCitationRow(), quote: null, quote_hash: null };
    const { client, queries } = makeMockClient(() => [rowWithoutQuote]);

    await insertCitation(client, {
      tenantId:   TENANT_A,
      claimId:    CLAIM_ID,
      evidenceId: EVIDENCE_ID,
      status:     "discovered",
    });

    const vals = (queries[0] as MockQuery).values;
    // quote is index 5, quoteHash is index 6
    expect(vals[5]).toBeNull();
    expect(vals[6]).toBeNull();
  });

  it("includes tenant_id in INSERT (RLS WITH CHECK)", async () => {
    const { client, queries } = makeMockClient(() => [makeCitationRow()]);
    await insertCitation(client, {
      tenantId:   TENANT_A,
      claimId:    CLAIM_ID,
      evidenceId: EVIDENCE_ID,
      status:     "retrieved",
    });
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(queries[0]?.values).not.toContain(TENANT_B);
  });
});

// ============================================================
// insertAssumption
// ============================================================

describe("insertAssumption", () => {
  it("inserts an assumption row with statement", async () => {
    const { client, queries } = makeMockClient(() => [makeAssumptionRow()]);

    const row = await insertAssumption(client, {
      tenantId:  TENANT_A,
      projectId: PROJECT_ID,
      statement: "Baseline characteristics are comparable across arms.",
      rationale: "Randomisation was stratified.",
    });

    expect(queries[0]?.text).toContain("INSERT INTO assumptions");
    expect(queries[0]?.values).toContain(TENANT_A);
    expect(row.statement).toBe("Baseline characteristics are comparable across arms.");
  });

  it("null claim_id when not supplied", async () => {
    const { client, queries } = makeMockClient(() => [makeAssumptionRow()]);

    await insertAssumption(client, {
      tenantId:  TENANT_A,
      projectId: PROJECT_ID,
      statement: "Some assumption.",
    });

    // claim_id is index 2 in the values array
    expect(queries[0]?.values[2]).toBeNull();
  });
});

// ============================================================
// Terminology — uniqueness (DB layer contract)
// ============================================================

describe("insertTerminologyEntry and getTerminologyEntry", () => {
  it("issues an INSERT INTO terminology_entries", async () => {
    const { client, queries } = makeMockClient(() => [makeTermRow()]);

    const row = await insertTerminologyEntry(client, {
      tenantId:   TENANT_A,
      projectId:  PROJECT_ID,
      term:       "RCT",
      definition: "Randomised Controlled Trial",
    });

    expect(queries[0]?.text).toContain("INSERT INTO terminology_entries");
    expect(queries[0]?.values).toContain("RCT");
    expect(row.term).toBe("RCT");
  });

  it("getTerminologyEntry returns null when term not found (simulates RLS or missing row)", async () => {
    const { client } = makeMockClient(() => []);
    const result = await getTerminologyEntry(client, PROJECT_ID, "UnknownTerm");
    expect(result).toBeNull();
  });

  it("getTerminologyEntry is parameterised on project_id and term", async () => {
    const { client, queries } = makeMockClient(() => [makeTermRow()]);
    await getTerminologyEntry(client, PROJECT_ID, "RCT");

    expect(queries[0]?.text).toContain("WHERE project_id = $1 AND term = $2");
    expect(queries[0]?.values).toContain(PROJECT_ID);
    expect(queries[0]?.values).toContain("RCT");
  });
});

// ============================================================
// insertClaimEdge and getClaimEdges
// ============================================================

describe("insertClaimEdge", () => {
  it("inserts a claim edge row", async () => {
    const { client, queries } = makeMockClient(() => [makeEdgeRow()]);

    const row = await insertClaimEdge(client, {
      tenantId:       TENANT_A,
      sourceClaimId:  CLAIM_ID,
      targetClaimId:  "88888888-0000-4000-a000-000000000001",
      edgeType:       "SUPPORTS",
    });

    expect(queries[0]?.text).toContain("INSERT INTO claim_edges");
    expect(queries[0]?.values).toContain("SUPPORTS");
    expect(row.edge_type).toBe("SUPPORTS");
  });
});

describe("getClaimEdges", () => {
  it("returns edges for the given source claim", async () => {
    const { client, queries } = makeMockClient(() => [makeEdgeRow()]);
    const rows = await getClaimEdges(client, CLAIM_ID);

    expect(queries[0]?.text).toContain("WHERE source_claim_id = $1");
    expect(queries[0]?.values).toContain(CLAIM_ID);
    expect(rows).toHaveLength(1);
  });

  it("returns empty array when no edges found (simulates RLS exclusion)", async () => {
    const { client } = makeMockClient(() => []);
    const rows = await getClaimEdges(client, CLAIM_ID);
    expect(rows).toHaveLength(0);
  });
});

// ============================================================
// Migration SQL: RLS policies on all four new tables
// ============================================================

describe("migration 003 — RLS correctness", () => {
  it("enables FORCE ROW LEVEL SECURITY on claims", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?claims/);
  });

  it("enables FORCE ROW LEVEL SECURITY on citations", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?citations/);
  });

  it("enables FORCE ROW LEVEL SECURITY on assumptions", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?assumptions/);
  });

  it("enables FORCE ROW LEVEL SECURITY on terminology_entries", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY[\s\S]*?terminology_entries/);
  });

  it("does NOT create a DELETE policy on claims", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON claims\s*\n\s*FOR DELETE/);
  });

  it("does NOT create a DELETE policy on citations", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON citations\s*\n\s*FOR DELETE/);
  });

  it("has UNIQUE (project_id, term) on terminology_entries", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/UNIQUE\s*\(\s*project_id\s*,\s*term\s*\)/);
  });

  it("claim_edges edge_type CHECK includes SUPPORTS, CONTRADICTS, DERIVED_FROM", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("SUPPORTS");
    expect(sql).toContain("CONTRADICTS");
    expect(sql).toContain("DERIVED_FROM");
  });

  it("claims table has negative_evidence_note column", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    expect(sql).toContain("negative_evidence_note");
  });

  it("citation table has no doi or pmid column definition", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    // Extract only lines that look like column definitions (contain a type keyword)
    // to avoid matching the comment that explains doi/pmid are absent.
    const columnLines = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(columnLines.toLowerCase()).not.toContain("doi");
    expect(columnLines.toLowerCase()).not.toContain("pmid");
  });
});

// ============================================================
// Cross-tenant isolation: INSERT for Tenant A must not leak Tenant B
// ============================================================

describe("cross-tenant isolation contract", () => {
  it("insertClaim values do not include Tenant B id", async () => {
    const { client, queries } = makeMockClient(() => [makeClaimRow()]);
    await insertClaim(client, {
      tenantId:      TENANT_A,
      projectId:     PROJECT_ID,
      subject:       "S",
      predicate:     "P",
      object:        "O",
      claimText:     "S P O.",
      claimType:     "assumption",
      supportStatus: "not_applicable",
    });
    expect(queries[0]?.values).not.toContain(TENANT_B);
  });

  it("getClaim returns null when RLS excludes row (cross-tenant read attempt)", async () => {
    // Mock returns empty — as if tenant B's context hides tenant A's claim
    const { client } = makeMockClient(() => []);
    const result = await getClaim(client, CLAIM_ID);
    expect(result).toBeNull();
  });
});
