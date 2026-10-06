/**
 * Budget contracts — Phase 9 (Unit 3: budget breaker).
 *
 * Zod schemas for the project budget hard-stop:
 *   - BudgetCheckSchema     — { spentMinorUnits, budgetMinorUnits } as bigint.
 *   - BudgetResultSchema    — { passed, remaining, overBy } as bigint.
 *   - BudgetBreachResultSchema — returned when the provider is not called.
 *
 * Directive Phase 9:
 *   "Project budget hard stop. Over budget does not call the provider."
 *
 * Monetary amounts are in minor units (cents, thousandths). bigint is
 * exact; number loses precision past 2^53.
 *
 * Status: Enterprise Candidate — Active Development
 */
import { z } from "zod";

// ============================================================
// Budget check — spent vs budget in minor units (bigint)
// ============================================================

export const BudgetCheckSchema = z.object({
  /** Amount already spent, in minor units. */
  spentMinorUnits:   z.bigint(),
  /** Budget cap for the project, in minor units. */
  budgetMinorUnits:  z.bigint(),
});
export type BudgetCheck = z.infer<typeof BudgetCheckSchema>;

export const BudgetResultSchema = z.object({
  /** True when within budget; false when over budget. */
  passed:        z.boolean(),
  /** Remaining budget (budget - spent). Negative when over budget. */
  remaining:     z.bigint(),
  /** Amount over budget (spent - budget), or null when within budget. */
  overBy:        z.bigint().nullable(),
});
export type BudgetResult = z.infer<typeof BudgetResultSchema>;

// ============================================================
// Budget breach result — returned when the provider is not called
// ============================================================

export const BudgetBreachResultSchema = z.object({
  /** True — the budget was breached. */
  breached:      z.literal(true),
  /** The budget result that triggered the breach. */
  budget:        BudgetResultSchema,
  /** English reason the provider was not called. */
  reason:        z.string().min(1),
});
export type BudgetBreachResult = z.infer<typeof BudgetBreachResultSchema>;
