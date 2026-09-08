export type DuplicatePairDecision = {
  leftId: string;
  rightId: string;
  decision: "same" | "different";
  updatedAt?: string;
};
export type DuplicateEvidence = {
  score: number;
  reasons: string[];
  conflicts: string[];
  automatic: boolean;
  hinA: string | null;
  hinB: string | null;
};
export type DuplicateAd = {
  id: string;
  title: string;
  source: string;
  url: string;
  price: number | null;
  location: string;
  hin: string | null;
  status: string;
};
export type DuplicateReviewData = {
  generatedAt: string;
  candidates: {
    left: DuplicateAd;
    right: DuplicateAd;
    evidence: DuplicateEvidence;
  }[];
  candidateTotal: number;
  offset: number;
  limit: number;
  groups: { id: string; reason: string; members: DuplicateAd[] }[];
  decisions: (DuplicatePairDecision & {
    left: DuplicateAd;
    right: DuplicateAd;
    conflict?: string;
  })[];
  counts: {
    advertisements: number;
    groupedAds: number;
    groups: number;
    displayUnits: number;
  };
};
