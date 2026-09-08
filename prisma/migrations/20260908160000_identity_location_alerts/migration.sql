BEGIN TRANSACTION;
ALTER TABLE "BoatGroup" ADD COLUMN "anchorListingId" TEXT;
ALTER TABLE "BoatGroup" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "BoatGroup" ADD COLUMN "retiredAt" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "vesselId" TEXT;
CREATE INDEX "Listing_vesselId_idx" ON "Listing"("vesselId");
ALTER TABLE "DuplicateDecision" ADD COLUMN "leftFingerprint" TEXT;
ALTER TABLE "DuplicateDecision" ADD COLUMN "rightFingerprint" TEXT;
ALTER TABLE "DuplicateDecision" ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "SavedSearch" ADD COLUMN "eventTypes" JSONB NOT NULL DEFAULT '["new-match","price-change","status-change"]';
ALTER TABLE "Alert" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "Alert" ADD COLUMN "lastAttemptAt" DATETIME;
ALTER TABLE "Alert" ADD COLUMN "deliveryHistory" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Alert" ADD COLUMN "eventDetails" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX "Alert_deliveredAt_nextAttemptAt_idx" ON "Alert"("deliveredAt","nextAttemptAt");
CREATE TABLE "VesselEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "vesselId" TEXT NOT NULL, "listingId" TEXT,
 "kind" TEXT NOT NULL, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "data" JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX "VesselEvent_vesselId_at_idx" ON "VesselEvent"("vesselId","at");
CREATE INDEX "VesselEvent_listingId_at_idx" ON "VesselEvent"("listingId","at");
CREATE TABLE "LocationOverride" (
 "listingId" TEXT NOT NULL PRIMARY KEY, "data" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 0, "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "LocationOverrideEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "listingId" TEXT NOT NULL, "action" TEXT NOT NULL,
 "data" JSONB NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LocationOverrideEvent_listingId_createdAt_idx" ON "LocationOverrideEvent"("listingId","createdAt");
CREATE TABLE "RouteCache" (
 "key" TEXT NOT NULL PRIMARY KEY, "data" JSONB NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "RouteCache_expiresAt_idx" ON "RouteCache"("expiresAt");
CREATE TABLE "ProviderState" ("key" TEXT NOT NULL PRIMARY KEY,"nextRequestAt" DATETIME NOT NULL);
COMMIT;
