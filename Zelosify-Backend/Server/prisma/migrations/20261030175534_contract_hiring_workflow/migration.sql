-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('READY', 'UPLOADING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "workMode" "WorkMode" NOT NULL DEFAULT 'REMOTE',
    "requiredSkills" TEXT[],
    "hiringManagerId" TEXT NOT NULL,
    "experienceMin" INTEGER NOT NULL,
    "experienceMax" INTEGER,
    "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCompletionDate" TIMESTAMP(3),
    "actionDate" TIMESTAMP(3),
    "status" "OpeningStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hiringProfile" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadIntentId" TEXT NOT NULL,
    "fileIndex" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3VersionId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProfileStatus" NOT NULL DEFAULT 'SUBMITTED',
    "shortlistedBy" TEXT,
    "shortlistedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "recommended" BOOLEAN,
    "recommendationScore" DOUBLE PRECISION,
    "recommendationReason" TEXT,
    "recommendationLatencyMs" INTEGER,
    "recommendationVersion" TEXT,
    "recommendationConfidence" DOUBLE PRECISION,
    "recommendedAt" TIMESTAMP(3),

    CONSTRAINT "hiringProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'READY',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storedObjects" JSONB,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileDecision" (
    "id" TEXT NOT NULL,
    "profileId" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "ProfileStatus" NOT NULL,
    "toStatus" "ProfileStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationJob" (
    "id" TEXT NOT NULL,
    "profileId" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opening_tenantId_status_postedDate_idx" ON "Opening"("tenantId", "status", "postedDate");

-- CreateIndex
CREATE INDEX "Opening_tenantId_hiringManagerId_idx" ON "Opening"("tenantId", "hiringManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "Opening_id_tenantId_key" ON "Opening"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hiringProfile_s3Key_key" ON "hiringProfile"("s3Key");

-- CreateIndex
CREATE INDEX "hiringProfile_tenantId_openingId_isDeleted_submittedAt_idx" ON "hiringProfile"("tenantId", "openingId", "isDeleted", "submittedAt");

-- CreateIndex
CREATE INDEX "hiringProfile_tenantId_uploadedBy_isDeleted_idx" ON "hiringProfile"("tenantId", "uploadedBy", "isDeleted");

-- CreateIndex
CREATE INDEX "hiringProfile_recommended_idx" ON "hiringProfile"("recommended");

-- CreateIndex
CREATE UNIQUE INDEX "hiringProfile_uploadIntentId_fileIndex_key" ON "hiringProfile"("uploadIntentId", "fileIndex");

-- CreateIndex
CREATE INDEX "UploadIntent_state_expiresAt_idx" ON "UploadIntent"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "UploadIntent_tenantId_uploadedBy_idx" ON "UploadIntent"("tenantId", "uploadedBy");

-- CreateIndex
CREATE INDEX "ProfileDecision_profileId_createdAt_idx" ON "ProfileDecision"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationJob_profileId_key" ON "RecommendationJob"("profileId");

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiringProfile" ADD CONSTRAINT "hiringProfile_openingId_tenantId_fkey" FOREIGN KEY ("openingId", "tenantId") REFERENCES "Opening"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiringProfile" ADD CONSTRAINT "hiringProfile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiringProfile" ADD CONSTRAINT "hiringProfile_uploadIntentId_fkey" FOREIGN KEY ("uploadIntentId") REFERENCES "UploadIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_openingId_tenantId_fkey" FOREIGN KEY ("openingId", "tenantId") REFERENCES "Opening"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileDecision" ADD CONSTRAINT "ProfileDecision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hiringProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationJob" ADD CONSTRAINT "RecommendationJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hiringProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
