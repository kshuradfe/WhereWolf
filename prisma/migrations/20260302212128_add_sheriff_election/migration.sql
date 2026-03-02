-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GamePhase" ADD VALUE 'election';
ALTER TYPE "GamePhase" ADD VALUE 'pass_badge';

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "electionState" TEXT,
ADD COLUMN     "electionVotes" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "pendingPhase" TEXT,
ADD COLUMN     "sheriffBadgeDestroyed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sheriffCandidates" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "sheriffId" INTEGER;
