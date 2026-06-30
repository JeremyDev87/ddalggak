export const domain = "hot-path-budget";
export const checks = ["progressive disclosure line/char/bullet budgets"];

export function runHotPathBudgetChecks({ skillBudgets, assertSkillBudget }) {
  for (const budget of skillBudgets) {
    assertSkillBudget(budget);
  }
}
