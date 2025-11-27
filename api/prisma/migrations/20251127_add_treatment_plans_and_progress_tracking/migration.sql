-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('SHORT_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'MET', 'MODIFIED', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goalType" "GoalType" NOT NULL,
    "domain" TEXT NOT NULL,
    "baseline" JSONB,
    "targetCriteria" TEXT NOT NULL,
    "measurementMethod" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "masteryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "behaviorObservations" TEXT,
    "interventionsUsed" TEXT,
    "recommendedAdjustments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_points" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "progressNoteId" TEXT,
    "sessionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_plans_patientId_organizationId_idx" ON "treatment_plans"("patientId", "organizationId");

-- CreateIndex
CREATE INDEX "treatment_plans_status_organizationId_idx" ON "treatment_plans"("status", "organizationId");

-- CreateIndex
CREATE INDEX "treatment_plans_createdByUserId_idx" ON "treatment_plans"("createdByUserId");

-- CreateIndex
CREATE INDEX "goals_treatmentPlanId_organizationId_idx" ON "goals"("treatmentPlanId", "organizationId");

-- CreateIndex
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "progress_notes_sessionId_key" ON "progress_notes"("sessionId");

-- CreateIndex
CREATE INDEX "progress_notes_sessionId_organizationId_idx" ON "progress_notes"("sessionId", "organizationId");

-- CreateIndex
CREATE INDEX "progress_notes_treatmentPlanId_idx" ON "progress_notes"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "progress_notes_createdByUserId_idx" ON "progress_notes"("createdByUserId");

-- CreateIndex
CREATE INDEX "data_points_goalId_date_idx" ON "data_points"("goalId", "date");

-- CreateIndex
CREATE INDEX "data_points_sessionId_organizationId_idx" ON "data_points"("sessionId", "organizationId");

-- CreateIndex
CREATE INDEX "data_points_progressNoteId_idx" ON "data_points"("progressNoteId");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_progressNoteId_fkey" FOREIGN KEY ("progressNoteId") REFERENCES "progress_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
