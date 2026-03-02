-- CreateEnum
CREATE TYPE "Team" AS ENUM ('villager', 'werewolf', 'neutral');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('waiting', 'night', 'day', 'voting', 'ended');

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "roomCode" TEXT NOT NULL,
    "players" TEXT NOT NULL DEFAULT '[]',
    "timerLimit" INTEGER NOT NULL DEFAULT 60,
    "isShowRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "gameStarted" BOOLEAN NOT NULL DEFAULT false,
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "team" "Team" NOT NULL DEFAULT 'villager',
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "phase" "GamePhase" NOT NULL DEFAULT 'waiting',
    "dayNumber" INTEGER NOT NULL DEFAULT 0,
    "timeRemaining" INTEGER NOT NULL DEFAULT 0,
    "currentPhaseStarted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alivePlayers" TEXT NOT NULL DEFAULT '[]',
    "deadPlayers" TEXT NOT NULL DEFAULT '[]',
    "votes" TEXT NOT NULL DEFAULT '{}',
    "nightActions" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLog" (
    "id" SERIAL NOT NULL,
    "gameSessionId" INTEGER NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" INTEGER,
    "targetId" INTEGER,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_roomCode_key" ON "rooms"("roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
