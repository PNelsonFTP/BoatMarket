import { getWorkspace, putWorkspace } from "../server/repository";
import { db } from "../server/db";
import {
  LAKE_SEARCHES,
  LAKE_HOLIDAY_RULE,
  LAKE_HOLIDAY,
} from "../lib/lake-holiday";
const { workspace, revision } = await getWorkspace();
const savedIds = new Set(LAKE_SEARCHES.map((s) => s.id));
const next = {
  ...workspace,
  savedSearches: [
    ...LAKE_SEARCHES,
    ...workspace.savedSearches.filter((s) => !savedIds.has(s.id)),
  ],
  rules: [
    LAKE_HOLIDAY_RULE,
    ...workspace.rules.filter((r) => r.id !== LAKE_HOLIDAY_RULE.id),
  ],
  referencePoints: [
    LAKE_HOLIDAY,
    ...workspace.referencePoints
      .filter((p) => !p.name.includes("Lake Holiday"))
      .map((p) => ({ ...p, name: p.name.replace(/^Home · /, "") })),
  ],
};
await putWorkspace(next, revision);
console.log(
  `Lake Holiday home, length screening, and ${LAKE_SEARCHES.length} saved searches configured.`,
);
await db.$disconnect();
