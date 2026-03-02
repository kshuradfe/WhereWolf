import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

function parseJsonArray(val: unknown): number[] {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return Array.isArray(val) ? val : [];
}

async function getPlayerTeam(playerIdx: number, roomId: number): Promise<string | null> {
  const room = await prisma.rooms.findUnique({ where: { id: roomId } });
  if (!room) return null;
  let playersData: Array<{ role: number | null }> = [];
  try {
    const parsed = JSON.parse(room.players as unknown as string);
    playersData = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : [];
  } catch { return null; }
  const roleId = playersData[playerIdx]?.role;
  if (!roleId) return null;
  const role = await prisma.roles.findUnique({ where: { id: roleId } });
  return role?.team ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, playerId, playerName } = await request.json();

    if (sessionId == null || playerId == null) {
      return NextResponse.json({ success: false, message: "sessionId and playerId are required" }, { status: 400 });
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return NextResponse.json({ success: false, message: "LiveKit is not configured" }, { status: 500 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    const room = await prisma.rooms.findUnique({ where: { id: session.roomId } });
    if (!room) {
      return NextResponse.json({ success: false, message: "Room not found" }, { status: 404 });
    }

    const alive = parseJsonArray(session.alivePlayers as unknown);
    const isAlive = alive.includes(playerId);
    const phase = session.phase as string;
    const identity = `player-${playerId}`;
    const name = playerName || `Player ${playerId + 1}`;

    let livekitRoom: string;
    let canPublish = false;
    let canSubscribe = true;

    if (phase === "night") {
      // Night: only wolves get a room; others get no token
      const team = await getPlayerTeam(playerId, session.roomId);
      if (team !== "werewolf" || !isAlive) {
        return NextResponse.json({
          success: true,
          data: { token: null, room: null, canPublish: false },
        });
      }
      livekitRoom = `${room.roomCode}-wolves`;
      canPublish = true;
      canSubscribe = true;
    } else if (phase === "day" || phase === "election" || phase === "voting") {
      // Day/election/voting: public room, only currentSpeaker can publish
      livekitRoom = `${room.roomCode}-public`;
      canPublish = isAlive && playerId === (session as Record<string, unknown>).currentSpeakerId;
      canSubscribe = true;
    } else {
      // Other phases (waiting, hunter_shoot, pass_badge, ended): no voice
      return NextResponse.json({
        success: true,
        data: { token: null, room: null, canPublish: false },
      });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: "30m",
    });

    at.addGrant({
      roomJoin: true,
      room: livekitRoom,
      canPublish,
      canSubscribe,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      success: true,
      data: { token, room: livekitRoom, canPublish },
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json({ success: false, message: "Failed to generate token" }, { status: 500 });
  }
}
