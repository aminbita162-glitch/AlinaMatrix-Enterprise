/**
 * DB layer for project budgets — Phase 9 Unit 3 (budget breaker).
 *
 * Table: project_budgets — one row per (tenant_id, project_id).
 *
 * Immutability:
 *   project_budgets is updatable (spent_minor_units accrues). No
 *   immutability trigger — RLS enforces tenant isolation.
 *
 * Directive Phase 9:
 *   "Project budget hard stop. Over budget does not call the provider."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { v4 as uuidv4 } from "uuid";
import type { DbClient } from "./client.js";

// ============================================================
// Row types
// ============================================================

export interface ProjectBudgetRow {
  id:                 string;
  tenant_id:          string;
  project_id:         string;
  budget_minor_units: bigint;
  spent_minor_units:  bigint;
  created_at:         Date;
  updated_at:         Date;
}

// ============================================================
// project_budgets — CRUD
// ============================================================

export interface InsertProjectBudgetParams {
  tenantId:           string;
  projectId:          string;
  budgetMinorUnits:   bigint;
  spentMinorUnits?:   bigint;
}

export async function insertProjectBudget(
  client: DbClient,
  params: InsertProjectBudgetParams,
): Promise<ProjectBudgetRow> {
  const id = uuidv4();
  const res = await client.query<ProjectBudgetRow>(
    `INSERT INTO project_budgets (id, tenant_id, project_id, budget_minor_units, spent_minor_units)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, project_id) DO NOTHING
     RETURNING *`,
    [
      id,
      params.tenantId,
      params.projectId,
      params.budgetMinorUnits.toString(),
      (params.spentMinorUnits ?? 0n).toString(),
    ],
  );
  if (res.rows.length === 0) {
    return getProjectBudget(client, params.tenantId, params.projectId);
  }
  return res.rows[0]!;
}

export async function getProjectBudget(
  client: DbClient,
  tenantId: string,
  projectId: string,
): Promise<ProjectBudgetRow> {
  const res = await client.query<ProjectBudgetRow>(
    `SELECT * FROM project_budgets WHERE tenant_id = $1 AND project_id = $2`,
    [tenantId, projectId],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Project budget not found for tenant ${tenantId}, project ${projectId}`,
    );
  }
  return res.rows[0]!;
}

export interface IncreaseProjectBudgetSpentParams {
  tenantId:         string;
  projectId:        string;
  amount:           bigint;
}

/**
 * Increase the spent amount for a project budget by the given amount
 * (in minor units). Returns the updated row.
 */
export async function increaseProjectBudgetSpent(
  client: DbClient,
  params: IncreaseProjectBudgetSpentParams,
): Promise<ProjectBudgetRow> {
  const res = await client.query<ProjectBudgetRow>(
    `UPDATE project_budgets
       SET spent_minor_units = spent_minor_units + $3,
           updated_at = now()
     WHERE tenant_id = $1 AND project_id = $2
     RETURNING *`,
    [params.tenantId, params.projectId, params.amount.toString()],
  );
  if (res.rows.length === 0) {
    throw new Error(
      `Project budget not found for tenant ${params.tenantId}, project ${params.projectId}`,
    );
  }
  return res.rows[0]!;
}
