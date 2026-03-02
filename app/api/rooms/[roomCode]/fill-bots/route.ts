import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;

    const room = await prisma.rooms.findUnique({ where: { roomCode } });
    if (!room) {
      return NextResponse.json({ success: false, message: "Room not found" }, { status: 404 });
    }

    if (room.gameStarted) {
      return NextResponse.json({ success: false, message: "Game already started" }, { status: 400 });
    }

    const raw = room.players as unknown as string;
    let playersData: { players?: unknown[]; selectedRoles?: number[] } | unknown[] | null = null;
    try {
      playersData = JSON.parse(raw);
    } catch {
      return NextResponse.json({ success: false, message: "Invalid players data" }, { status: 500 });
    }

    const isWrapped = playersData && !Array.isArray(playersData) && typeof playersData === "object" && "players" in (playersData as object);

    type StoredPlayer = {
      name: string | null;
      isAdmin?: boolean;
      role?: number | null;
      isAlive?: boolean;
      isOnline?: boolean;
      isReady?: boolean;
    };

    const players: StoredPlayer[] = isWrapped
      ? ((playersData as { players: StoredPlayer[] }).players ?? [])
      : (playersData as StoredPlayer[]);

    const selectedRoles: number[] = isWrapped
      ? ((playersData as { selectedRoles?: number[] }).selectedRoles ?? [])
      : [];

    let botCounter = 1;
    const filled = players.map((p) => {
      if (!p || !p.name) {
        return {
          ...p,
          name: `Bot ${botCounter++}`,
          isAdmin: false,
          isAlive: true,
          isOnline: true,
          isReady: false,
        };
      }
      return p;
    });

    const updatedPayload = isWrapped ? { players: filled, selectedRoles } : filled;

    const updatedRoom = await prisma.rooms.update({
      where: { roomCode },
      data: { players: JSON.stringify(updatedPayload) },
    });

    return NextResponse.json({ success: true, data: updatedRoom });
  } catch (error) {
    console.error("Error filling bots:", error);
    return NextResponse.json({ success: false, message: "Failed to fill bots" }, { status: 500 });
  }
}
