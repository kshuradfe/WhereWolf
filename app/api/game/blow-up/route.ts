import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const GOD_ROLE_NAMES = ["seer", "witch", "hunter", "guard", "预言家", "女巫", "猎人", "守卫"];

function parseJsonArray(val: unknown): number[] {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return Array.isArray(val) ? val : [];
}

async function checkWinCondition(alive: number[], roomId: number): Promise<string | null> {
  const room = await prisma.rooms.findUnique({ where: { id: roomId } });
  if (!room) return null;

  let playersData: Array<{ role: number | null }> = [];
  try {
    const parsed = JSON.parse(room.players as unknown as string);
    playersData = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : [];
  } catch { playersData = []; }

  const roles = await prisma.roles.findMany();
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  let aliveWolves = 0, aliveGods = 0, aliveVillagers = 0;
  for (const idx of alive) {
    const roleId = playersData[idx]?.role;
    if (!roleId) continue;
    const role = roleMap.get(roleId);
    if (!role) continue;
    if (role.team === "werewolf") aliveWolves++;
    else if (GOD_ROLE_NAMES.some((n) => role.name.toLowerCase() === n)) aliveGods++;
    else aliveVillagers++;
  }

  if (aliveWolves === 0) return "villager";
  if (aliveGods === 0 || aliveVillagers === 0) return "werewolf";
  return null;
}

async function isWerewolf(playerIdx: number, roomId: number): Promise<boolean> {
  const room = await prisma.rooms.findUnique({ where: { id: roomId } });
  if (!room) return false;
  let playersData: Array<{ role: number | null }> = [];
  try {
    const parsed = JSON.parse(room.players as unknown as string);
    playersData = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : [];
  } catch { return false; }

  const roleId = playersData[playerIdx]?.role;
  if (!roleId) return false;
  const role = await prisma.roles.findUnique({ where: { id: roleId } });
  return role?.team === "werewolf";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, playerId } = body;

    if (!sessionId || playerId === undefined) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    // Phase must be day or election
    if (session.phase !== "day" && session.phase !== "election") {
      return NextResponse.json({ success: false, message: "Can only self-destruct during day or election phase" }, { status: 400 });
    }

    let alive = parseJsonArray(session.alivePlayers as unknown);
    let dead = parseJsonArray(session.deadPlayers as unknown);

    if (!alive.includes(playerId)) {
      return NextResponse.json({ success: false, message: "Player is not alive" }, { status: 400 });
    }

    // Validate player is a werewolf
    const isWolf = await isWerewolf(playerId, session.roomId);
    if (!isWolf) {
      return NextResponse.json({ success: false, message: "Only werewolves can self-destruct" }, { status: 403 });
    }

    // Kill the wolf
    alive = alive.filter((p) => p !== playerId);
    dead = Array.from(new Set([...dead, playerId]));

    // Build update data
    const nextDay = session.dayNumber + 1;
    const updateData: Record<string, unknown> = {
      alivePlayers: JSON.stringify(alive),
      deadPlayers: JSON.stringify(dead),
      votes: JSON.stringify({}),
      nightActions: JSON.stringify({}),
      dayNumber: nextDay,
    };

    // If blowing up during election, destroy the sheriff badge
    if (session.phase === "election") {
      updateData.sheriffBadgeDestroyed = true;
      updateData.sheriffId = null;
      updateData.electionState = null;
      updateData.sheriffCandidates = JSON.stringify([]);
      updateData.electionVotes = JSON.stringify({});
    }

    // Check win condition
    const winner = await checkWinCondition(alive, session.roomId);
    updateData.phase = winner ? "ended" : "night";

    await prisma.gameSession.update({ where: { id: sessionId }, data: updateData });

    return NextResponse.json({
      success: true,
      data: {
        phase: updateData.phase,
        dayNumber: nextDay,
        winner,
        blowUpPlayerId: playerId,
      },
    });
  } catch (error) {
    console.error("Error processing blow-up:", error);
    return NextResponse.json({ success: false, message: "Failed to process blow-up" }, { status: 500 });
  }
}
