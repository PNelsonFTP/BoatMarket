import { expect, it } from "vitest";
import { lakeHolidayWorkspace, LAKE_HOLIDAY_RULE } from "../lib/lake-holiday";
import {
  CURRENT_LAKE_RULES_URL,
  reconcileLakePolicy,
  verificationApplies,
} from "../lib/lake-verification";
import { type RuleSet } from "../lib/types";
import { workspaceRestoreSchema } from "../lib/import-workspace";
function oldWorkspace() {
  const workspace = structuredClone(lakeHolidayWorkspace());
  function old(rule: RuleSet) {
    const review = rule.id === "holiday-length-review";
    return {
      ...rule,
      maxLengthExclusive: true,
      name: review
        ? "Under 21 ft or length unreported · verify"
        : "Lake Holiday IL · under 21 ft (screening)",
      verification: undefined,
    };
  }
  workspace.rules = workspace.rules.map(old);
  workspace.savedSearches = workspace.savedSearches.map((search) => ({
    ...search,
    filters: {
      ...search.filters,
      ruleSet: search.filters.ruleSet ? old(search.filters.ruleSet) : undefined,
    },
  }));
  return workspace;
}
it("ships verifiable inclusive 21-foot factory screens with a dated official source", () => {
  const workspace = lakeHolidayWorkspace();
  expect(LAKE_HOLIDAY_RULE.maxLengthExclusive).toBe(false);
  for (const rule of [
    workspace.rules[0],
    ...(workspace.savedSearches
      .map((search) => search.filters.ruleSet)
      .filter(Boolean) as RuleSet[]),
  ]) {
    expect(verificationApplies(rule)).toBe(true);
    expect(rule.verification?.sourceUrl).toBe(CURRENT_LAKE_RULES_URL);
    expect(rule.verification?.status).toBe("public-document-reviewed");
  }
  expect(workspaceRestoreSchema.safeParse(workspace).success).toBe(true);
});
it("previews then updates all untouched old factory screens while preserving personal data and alert preferences", () => {
  const old = oldWorkspace();
  old.favorites = ["one"];
  old.notes.one = "Call seller after checking platform measurements";
  old.savedSearches[0].name = "My custom search name";
  old.savedSearches[0].cadence = "daily";
  old.savedSearches[0].filters.criteria.price = { max: 90000 };
  const before = structuredClone(old),
    result = reconcileLakePolicy(old);
  expect(old).toEqual(before);
  expect(result.changes).toHaveLength(6);
  expect(result.workspace).toMatchObject({
    favorites: ["one"],
    notes: old.notes,
  });
  expect(result.workspace.savedSearches[0]).toMatchObject({
    name: "My custom search name",
    cadence: "daily",
    filters: { criteria: { price: { max: 90000 } } },
  });
  expect(result.workspace.savedSearches[4].filters.ruleSet).toMatchObject({
    maxLengthExclusive: false,
    excludeUnknown: false,
  });
  expect(reconcileLakePolicy(result.workspace).changes).toEqual([]);
  expect(reconcileLakePolicy(result.workspace, true).changes).toEqual([]);
});
it("does not overwrite custom constraints or a newer verification without an explicit review", () => {
  const old = oldWorkspace();
  old.rules[0] = {
    ...old.rules[0],
    maxLength: 19,
    maxHp: 250,
    name: "Our conservative limit",
  };
  const defaultResult = reconcileLakePolicy(old);
  expect(defaultResult.workspace.rules[0]).toEqual(old.rules[0]);
  expect(defaultResult.skipped).toContain("Rule: Our conservative limit");
  const reviewed = reconcileLakePolicy(old, true).workspace.rules[0];
  expect(reviewed).toMatchObject({
    name: "Our conservative limit",
    maxLength: 21,
    maxLengthExclusive: false,
    maxHp: 250,
  });
  expect(verificationApplies(reviewed)).toBe(true);
  expect(verificationApplies({ ...reviewed, maxHp: 300 })).toBe(false);
});
