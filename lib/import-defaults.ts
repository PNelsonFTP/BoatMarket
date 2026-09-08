import { LAKE_HOLIDAY, LAKE_HOLIDAY_RULE, LAKE_SEARCHES } from "./lake-holiday";
import { type Workspace } from "./types";
/** Installing missing defaults never overwrites a user's edits unless explicitly requested. */
export function configureLakeHolidayWorkspace(
  workspace: Workspace,
  resetExisting = false,
): Workspace {
  function defaults<T>(current: T[], values: T[], key: (v: T) => string) {
    if (resetExisting) {
      const keys = new Set(values.map(key));
      return [...values, ...current.filter((v) => !keys.has(key(v)))];
    }
    const keys = new Set(current.map(key));
    return [...current, ...values.filter((v) => !keys.has(key(v)))];
  }
  return {
    ...workspace,
    savedSearches: defaults(
      workspace.savedSearches,
      LAKE_SEARCHES,
      (s) => s.id,
    ),
    rules: defaults(workspace.rules, [LAKE_HOLIDAY_RULE], (r) => r.id),
    referencePoints: defaults(
      workspace.referencePoints,
      [LAKE_HOLIDAY],
      (p) => p.name,
    ),
  };
}
