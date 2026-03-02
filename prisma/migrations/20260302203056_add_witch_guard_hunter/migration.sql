-- AlterEnum
ALTER TYPE "GamePhase" ADD VALUE 'hunter_shoot';

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "guardLastTarget" INTEGER,
ADD COLUMN     "witchHealUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "witchPoisonUsed" BOOLEAN NOT NULL DEFAULT false;
