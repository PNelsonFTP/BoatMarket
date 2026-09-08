ALTER TABLE "Listing" ADD COLUMN "identityHin" TEXT;
CREATE INDEX "Listing_identityHin_idx" ON "Listing"("identityHin");
CREATE TABLE "DuplicateDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leftId" TEXT NOT NULL,
  "rightId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DuplicateDecision_leftId_fkey" FOREIGN KEY ("leftId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DuplicateDecision_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DuplicateDecision_leftId_rightId_key" ON "DuplicateDecision"("leftId", "rightId");
