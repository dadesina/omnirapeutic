-- CreateTable: BTG (Break-the-Glass) Emergency Access
-- HIPAA § 164.308(a)(4)(ii)(C) - Emergency Access Procedure
CREATE TABLE "btg_access_grants" (
    "id" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedToUserId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "btg_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Efficient query for checking active grants
CREATE INDEX "btg_access_grants_grantedToUserId_patientId_expiresAt_idx" ON "btg_access_grants"("grantedToUserId", "patientId", "expiresAt");

-- CreateIndex: All grants for a specific patient
CREATE INDEX "btg_access_grants_patientId_idx" ON "btg_access_grants"("patientId");

-- CreateIndex: All grants created by an admin
CREATE INDEX "btg_access_grants_grantedByUserId_idx" ON "btg_access_grants"("grantedByUserId");

-- CreateIndex: Cleanup expired grants efficiently
CREATE INDEX "btg_access_grants_expiresAt_idx" ON "btg_access_grants"("expiresAt");

-- CreateIndex: Audit timeline
CREATE INDEX "btg_access_grants_createdAt_idx" ON "btg_access_grants"("createdAt");

-- AddForeignKey: Link to user who granted access
ALTER TABLE "btg_access_grants" ADD CONSTRAINT "btg_access_grants_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Link to user who received access
ALTER TABLE "btg_access_grants" ADD CONSTRAINT "btg_access_grants_grantedToUserId_fkey" FOREIGN KEY ("grantedToUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Link to patient record being accessed
ALTER TABLE "btg_access_grants" ADD CONSTRAINT "btg_access_grants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Link to user who revoked access (optional)
ALTER TABLE "btg_access_grants" ADD CONSTRAINT "btg_access_grants_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add comment for documentation
COMMENT ON TABLE "btg_access_grants" IS 'Break-the-Glass emergency access grants for HIPAA compliance. Tracks time-bound, audited emergency access to patient records.';
COMMENT ON COLUMN "btg_access_grants"."justification" IS 'Mandatory business justification for why emergency access is needed';
COMMENT ON COLUMN "btg_access_grants"."durationMinutes" IS 'How long the access grant is valid (e.g., 60, 120, 240 minutes)';
COMMENT ON COLUMN "btg_access_grants"."expiresAt" IS 'Calculated expiration timestamp (createdAt + durationMinutes)';
