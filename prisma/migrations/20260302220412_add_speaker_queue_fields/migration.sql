-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "currentSpeakerId" INTEGER,
ADD COLUMN     "speakerQueue" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "speakerStartTime" TIMESTAMP(3);
