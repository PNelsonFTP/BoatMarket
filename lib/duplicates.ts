export type DuplicatePairDecision = {
  leftId: string;
  rightId: string;
  decision: "same" | "different";
  updatedAt?: string;
  leftFingerprint?: string | null;
  rightFingerprint?: string | null;
  evidence?: unknown;
};
export type DuplicateEvidence = {
  score: number;
  reasons: string[];
  conflicts: string[];
  automatic: boolean;
  hinA: string | null;
  hinB: string | null;
  sharedImageIdentities?: string[];
  imageAudits?: {
    kind: "identical-file" | "similar-image";
    distance: number;
    leftUrl: string;
    rightUrl: string;
    method: string;
    auditedAt: string;
    provenance: unknown[];
  }[];
  descriptionOverlap?: number;
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
  vesselId?: string | null;
  distance?: number | null;
};
export type DuplicateReviewData = {
  generatedAt: string;
  candidates: {
    left: DuplicateAd;
    right: DuplicateAd;
    evidence: DuplicateEvidence;
    reviewedDecision?: "same" | "different";
    changedSinceReview?: boolean;
  }[];
  candidateTotal: number;
  offset: number;
  limit: number;
  filters?: DuplicateQueueFilters;
  groups: { id: string; reason: string; members: DuplicateAd[] }[];
  decisions: (DuplicatePairDecision & {
    left: DuplicateAd;
    right: DuplicateAd;
    conflict?: string;
    changedSinceReview?: boolean;
  })[];
  counts: {
    advertisements: number;
    groupedAds: number;
    groups: number;
    displayUnits: number;
    reviewedGroups?: number;
    hinGroups?: number;
  };
};

export type DuplicateQueueFilters = {
  activeOnly?: boolean;
  radiusMiles?: number;
  lat?: number;
  lng?: number;
  reviewState?: "unreviewed" | "changed" | "all";
};
export type VesselTimeline = {
  requestedId: string;
  vesselId: string;
  aliases: string[];
  identityBasis: string;
  members: DuplicateAd[];
  historicalAds: DuplicateAd[];
  totalEvents: number;
  offset: number;
  limit: number;
  events: {
    id: string;
    at: string;
    kind: string;
    listingId: string | null;
    source?: string;
    detail: string;
    price?: number | null;
  }[];
};
