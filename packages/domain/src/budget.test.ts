/**
 * Domain tests for Phase 9 Unit 3: budget breaker.
 *
 * All tests are pure (no I/O, no database).
 *
 * Covers:
 *   - checkBudget: within budget → passed: true; over budget → passed: false.
 *   - checkBudget: remaining and overBy computed correctly (bigint exact).
 *   - BudgetBreaker: within budget → calls the provider and returns output.
 *   - BudgetBreaker: over budget → returns BudgetBreachResult, does NOT call
 *     the provider (the fake provider call count stays 0).
 *
 * Directive Phase 9:
 *   "Project budget hard stop. Over budget does not call the provider."
 *
 * Status: Enterprise Candidate — Active Development
 */
import { describe, it, expect, vi } from "vitest";
import { checkBudget, BudgetBreaker } from "./budget.js";
import { DeterministicFakeProvider } from "./agents.js";
import type { BudgetCheck } from "@alinamatrix/contracts";

// ============================================================
// checkBudget
// ============================================================

describe("checkBudget", () => {
  it("passes when within budget", () => {
    const result = checkBudget({ spentMinorUnits: 500n, budgetMinorUnits: 1000n });
    expect(result.passed).toBe(true);
    expect(result.remaining).toBe(500n);
    expect(result.overBy).toBeNull();
  });

  it("passes when spent exactly equals budget", () => {
    const result = checkBudget({ spentMinorUnits: 1000n, budgetMinorUnits: 1000n });
    expect(result.passed).toBe(true);
    expect(result.remaining).toBe(0n);
    expect(result.overBy).toBeNull();
  });

  it("fails when over budget", () => {
    const result = checkBudget({ spentMinorUnits: 1500n, budgetMinorUnits: 1000n });
    expect(result.passed).toBe(false);
    expect(result.remaining).toBe(-500n);
    expect(result.overBy).toBe(500n);
  });

  it("computes overBy as spent - budget when over budget", () => {
    const result = checkBudget({ spentMinorUnits: 10000n, budgetMinorUnits: 3000n });
    expect(result.overBy).toBe(7000n);
    expect(result.remaining).toBe(-7000n);
  });

  it("handles zero budget with zero spent", () => {
    const result = checkBudget({ spentMinorUnits: 0n, budgetMinorUnits: 0n });
    expect(result.passed).toBe(true);
    expect(result.remaining).toBe(0n);
    expect(result.overBy).toBeNull();
  });

  it("handles zero budget with nonzero spent (over budget)", () => {
    const result = checkBudget({ spentMinorUnits: 1n, budgetMinorUnits: 0n });
    expect(result.passed).toBe(false);
    expect(result.overBy).toBe(1n);
  });

  it("uses bigint comparison (exact, not floating point)", () => {
    const big: BudgetCheck = {
      spentMinorUnits:  9_007_199_254_740_993n,
      budgetMinorUnits: 9_007_199_254_740_992n,
    };
    const result = checkBudget(big);
    expect(result.passed).toBe(false);
    expect(result.overBy).toBe(1n);
  });
});

// ============================================================
// BudgetBreaker
// ============================================================

describe("BudgetBreaker", () => {
  const input = {
    promptSha256:  "a".repeat(64),
    schemaSha256:  "b".repeat(64),
    inputHash:     "c".repeat(64),
  };

  it("calls the provider when within budget and returns FakeProviderOutput", () => {
    const provider = new DeterministicFakeProvider();
    const breaker = new BudgetBreaker(provider);
    const result = breaker.call(
      { spentMinorUnits: 100n, budgetMinorUnits: 1000n },
      input,
    );
    expect("outputJson" in result).toBe(true);
    expect("outputHash" in result).toBe(true);
  });

  it("does NOT call the provider when over budget", () => {
    const callSpy = vi.spyOn(DeterministicFakeProvider.prototype, "call");
    const provider = new DeterministicFakeProvider();
    const breaker = new BudgetBreaker(provider);
    const result = breaker.call(
      { spentMinorUnits: 1500n, budgetMinorUnits: 1000n },
      input,
    );
    expect(callSpy).not.toHaveBeenCalled();
    expect("breached" in result).toBe(true);
    if ("breached" in result) {
      expect(result.breached).toBe(true);
      expect(result.budget.passed).toBe(false);
      expect(result.reason).toContain("Budget breached");
    }
    callSpy.mockRestore();
  });

  it("returns a BudgetBreachResult with the correct overBy when over budget", () => {
    const provider = new DeterministicFakeProvider();
    const breaker = new BudgetBreaker(provider);
    const result = breaker.call(
      { spentMinorUnits: 2000n, budgetMinorUnits: 1000n },
      input,
    );
    expect("breached" in result).toBe(true);
    if ("breached" in result) {
      expect(result.budget.overBy).toBe(1000n);
      expect(result.reason).toContain("1000");
    }
  });

  it("calls the provider when spent exactly equals budget", () => {
    const callSpy = vi.spyOn(DeterministicFakeProvider.prototype, "call");
    const provider = new DeterministicFakeProvider();
    const breaker = new BudgetBreaker(provider);
    const result = breaker.call(
      { spentMinorUnits: 1000n, budgetMinorUnits: 1000n },
      input,
    );
    expect(callSpy).toHaveBeenCalledTimes(1);
    expect("outputJson" in result).toBe(true);
    callSpy.mockRestore();
  });

  it("does not call the provider even by one minor unit over budget", () => {
    const callSpy = vi.spyOn(DeterministicFakeProvider.prototype, "call");
    const provider = new DeterministicFakeProvider();
    const breaker = new BudgetBreaker(provider);
    const result = breaker.call(
      { spentMinorUnits: 1001n, budgetMinorUnits: 1000n },
      input,
    );
    expect(callSpy).not.toHaveBeenCalled();
    expect("breached" in result).toBe(true);
    callSpy.mockRestore();
  });
});
