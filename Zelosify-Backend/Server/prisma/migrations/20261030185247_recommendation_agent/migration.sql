-- AlterTable
ALTER TABLE "RecommendationJob" ADD COLUMN     "audit" JSONB,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "leaseToken" TEXT,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hiringProfile" ADD COLUMN     "recommendationCategory" TEXT,
ADD COLUMN     "recommendationData" JSONB;

-- CreateIndex
CREATE INDEX "RecommendationJob_state_availableAt_idx" ON "RecommendationJob"("state", "availableAt");
