/**
 * Budget breaker — Phase 9 (Unit 3: budget breaker).
 *
 * Covers:
 *   - checkBudget — returns { passed, remaining, overBy } using bigint
 *     comparison. Over budget → passed: false; the caller must not
 *     call the provider.
 *   - BudgetBreaker — a thin wrapper that holds a DeterministicFakeProvider
 *     and refuses to call it when over budget, returning a
 *     BudgetBreachResult instead.
 *
 * Directive Phase 9:
 *   "Project budget hard stop. Over budget does not call the provider."
 *
 * Monetary amounts are in minor units (cents, thousandths). bigint is
 * exact; number loses precision past 2^53. The budget check is
 * `spentMinorUnits > budgetMinorUnits` (bigint comparison, exact).
 *
 * Status: Enterprise Candidate — Active Development
 */
import type {
  BudgetCheck,
  BudgetResult,
  BudgetBreachResult,
} from "@alinamatrix/contracts";
import {
  DeterministicFakeProvider,
  type FakeProviderInput,
  type FakeProviderOutput,
} from "./agents.js";

// ============================================================
// Budget check
// ============================================================

/**
 * Check a project budget.
 *
 * Over budget → passed: false; the caller must not call the provider.
 * Within budget → passed: true; remaining = budget - spent.
 *
 * @example
 *   checkBudget({ spentMinorUnits: 1500n, budgetMinorUnits: 1000n })
 *   // => { passed: false, remaining: -500n, overBy: 500n }
 */
export function checkBudget(input: BudgetCheck): BudgetResult {
  const remaining = input.budgetMinorUnits - input.spentMinorUnits;
  const overBy = remaining < 0n ? -remaining : null;
  return {
    passed:   input.spentMinorUnits <= input.budgetMinorUnits,
    remaining,
    overBy,
  };
}

// ============================================================
// Budget breaker — refuses to call the provider when over budget
// ============================================================

/**
 * BudgetBreaker wraps a DeterministicFakeProvider and refuses to call it
 * when the budget is exceeded. When within budget, it delegates to the
 * provider. When over budget, it returns a BudgetBreachResult and does
 * not invoke the provider at all.
 *
 * Directive: "Over budget does not call the provider."
 */
export class BudgetBreaker {
  private readonly provider: DeterministicFakeProvider;

  constructor(provider?: DeterministicFakeProvider) {
    this.provider = provider ?? new DeterministicFakeProvider();
  }

  /**
   * Call the provider if within budget; otherwise return a breach result
   * without calling the provider.
   */
  call(
    budget: BudgetCheck,
    input: FakeProviderInput,
  ): FakeProviderOutput | BudgetBreachResult {
    const result = checkBudget(budget);
    if (!result.passed) {
      return {
        breached: true,
        budget:   result,
        reason:    `Budget breached: spent ${budget.spentMinorUnits} minor units exceeds budget ${budget.budgetMinorUnits} minor units (over by ${result.overBy}). Provider not called.`,
      };
    }
    return this.provider.call(input);
  }
}
