import type { RuleSet, Workspace } from "./types";
export const CURRENT_LAKE_RULES_URL =
  "https://engage.goenumerate.com/s/lakeholiday/files/4219/dyn139681/Rules%20and%20Reg%2012_2_2025%20revised.pdf";
export const LAKE_RULE_DOCUMENT = {
  sourceUrl: CURRENT_LAKE_RULES_URL,
  indexUrl:
    "https://engage.goenumerate.com/s/lakeholiday/dyndocuments.php?group=139681",
  title: "Lake Holiday Rules and Regulations — cover dated December 2, 2025",
  documentDate: "2025-12-02",
  reviewedAt: "2026-09-08T16:05:05.000Z",
  sha256: "d8475602712766c1efd463cdaef9d61a30042d3582b4fff3159543e8e6be27d3",
  sections: ["4.15 (PDF page 13)", "4.27 (PDF page 14)", "4.29 (PDF page 15)"],
  summary:
    "The publicly posted rulebook permits hulled boats up to and including 21.0 ft by manufacturer US specifications, including molded platforms. Bolt-on platforms are accessories. Pontoons are limited to 28.0 ft. Motor power may not exceed the capacity plate. Wake-enhancer use and wakesurfing remain prohibited.",
  limitation:
    "This is the latest document publicly linked by the association when reviewed, not confirmation that no later amendment exists. Older introduction/footer dates remain inside the PDF. Boat registration and measurement confirmation still belong to the association.",
};
export function screeningFingerprint(rule: RuleSet) {
  return JSON.stringify({
    maxLength: rule.maxLength ?? null,
    maxLengthExclusive: !!rule.maxLengthExclusive,
    maxHp: rule.maxHp ?? null,
    maxLoadedWeight: rule.maxLoadedWeight ?? null,
    allowedPropulsion: [...(rule.allowedPropulsion || [])].sort(),
    excludedCategories: [...(rule.excludedCategories || [])].sort(),
    excludeUnknown: rule.excludeUnknown,
  });
}
export function lakeVerification(
  rule: RuleSet,
): NonNullable<RuleSet["verification"]> {
  return {
    status: "public-document-reviewed",
    sourceUrl: CURRENT_LAKE_RULES_URL,
    documentDate: LAKE_RULE_DOCUMENT.documentDate,
    reviewedAt: LAKE_RULE_DOCUMENT.reviewedAt,
    summary: LAKE_RULE_DOCUMENT.summary,
    screeningFingerprint: screeningFingerprint(rule),
  };
}
export function verificationApplies(rule: RuleSet) {
  return (
    !!rule.verification &&
    rule.verification.screeningFingerprint === screeningFingerprint(rule)
  );
}
const factoryRules: Record<string, { previous: RuleSet; name: string }> = {
  "lake-holiday-il-length": {
    previous: {
      id: "lake-holiday-il-length",
      name: "Lake Holiday IL · under 21 ft (screening)",
      maxLength: 21,
      maxLengthExclusive: true,
      excludeUnknown: true,
    },
    name: "Lake Holiday IL · up to 21 ft (screening)",
  },
  "holiday-length-review": {
    previous: {
      id: "holiday-length-review",
      name: "Under 21 ft or length unreported · verify",
      maxLength: 21,
      maxLengthExclusive: true,
      excludeUnknown: false,
    },
    name: "Up to 21 ft or length unreported · verify",
  },
};
export function reconcileLakePolicy(
  workspace: Workspace,
  includeCustomized = false,
) {
  const changes: { scope: string; name: string; customized: boolean }[] = [],
    skipped: string[] = [];
  function revise(rule: RuleSet, scope: string): RuleSet {
    const factory = factoryRules[rule.id];
    if (!factory) return rule;
    if (
      rule.maxLength === 21 &&
      !rule.maxLengthExclusive &&
      verificationApplies(rule) &&
      rule.verification?.sourceUrl === CURRENT_LAKE_RULES_URL &&
      rule.verification.documentDate === LAKE_RULE_DOCUMENT.documentDate
    )
      return rule;
    const unchangedOld =
      screeningFingerprint(rule) === screeningFingerprint(factory.previous) &&
      rule.name === factory.previous.name &&
      !rule.verification;
    if (!unchangedOld && !includeCustomized) {
      if (!verificationApplies(rule)) skipped.push(scope);
      return rule;
    }
    const next = {
      ...rule,
      name: rule.name === factory.previous.name ? factory.name : rule.name,
      maxLength: 21,
      maxLengthExclusive: false,
    };
    changes.push({ scope, name: rule.name, customized: !unchangedOld });
    return { ...next, verification: lakeVerification(next) };
  }
  const builtins = new Set([
    "holiday-nearby",
    "holiday-fishing",
    "holiday-ski",
    "holiday-expanded",
    "holiday-review",
    "holiday-all-nearby",
  ]);
  const rules = workspace.rules.map((rule) =>
    revise(rule, `Rule: ${rule.name}`),
  );
  const savedSearches = workspace.savedSearches.map((search) => {
    if (!builtins.has(search.id) || !search.filters.ruleSet) return search;
    const ruleSet = revise(
      search.filters.ruleSet,
      `Saved search: ${search.name}`,
    );
    if (ruleSet === search.filters.ruleSet) return search;
    return {
      ...search,
      name:
        search.id === "holiday-ski" &&
        search.name === "MasterCraft & peers · under 21 ft"
          ? "MasterCraft & peers · up to 21 ft"
          : search.name,
      filters: { ...search.filters, ruleSet },
    };
  });
  return {
    workspace: { ...workspace, rules, savedSearches },
    changes,
    skipped,
  };
}
