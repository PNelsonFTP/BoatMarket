import { allListings } from "../server/repository";
import { reviewNamedIdentityExamples } from "../server/identity-examples";
import { setDuplicateDecision } from "../server/duplicates";
import { atomicJson } from "../server/refresh-report";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply"))
    throw new Error(
      "Usage: node --import tsx scripts/review-identity-examples.ts [--apply]. Default only writes an evidence/recommendation report.",
    );
  const report = reviewNamedIdentityExamples(await allListings());
  const path = `data/research/identity-review-${report.generatedAt.replace(/[:.]/g, "-")}.json`;
  await atomicJson(path, report);
  const applied = [];
  if (args.includes("--apply"))
    for (const item of report.recommendations) {
      if (!item.sufficientLocalEvidence || item.decision === "review") continue;
      await setDuplicateDecision(item.leftId, item.rightId, item.decision, {
        reviewedBy: "local-evidence-research",
        note: `${item.reason} Evidence report: ${path}. Source observations: ${item.sources.map((s) => `${s.url} observed ${s.lastObservedAt}`).join("; ")}`,
      });
      applied.push({
        leftId: item.leftId,
        rightId: item.rightId,
        decision: item.decision,
      });
    }
  console.log(
    JSON.stringify(
      {
        report: path,
        basis: report.basis,
        recommendations: report.recommendations.map(
          ({ leftId, rightId, decision, sufficientLocalEvidence }) => ({
            leftId,
            rightId,
            decision,
            sufficientLocalEvidence,
          }),
        ),
        missing: report.missing,
        applied,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
