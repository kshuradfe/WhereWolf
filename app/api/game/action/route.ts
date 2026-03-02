import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, playerId, action, targetId } = body;

    if (!sessionId || playerId === undefined) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    // Validate witch potion usage
    if (action === "heal" && session.witchHealUsed) {
      return NextResponse.json({ success: false, message: "Heal potion already used" }, { status: 400 });
    }
    if (action === "poison" && session.witchPoisonUsed) {
      return NextResponse.json({ success: false, message: "Poison potion already used" }, { status: 400 });
    }

    // Validate guard cannot protect same player two nights in a row
    if (action === "guard" && targetId !== null && session.guardLastTarget === targetId) {
      return NextResponse.json(
        { success: false, message: "Cannot guard the same player two nights in a row" },
        { status: 400 }
      );
    }

    const nightActions = (() => {
      try {
        return JSON.parse(session.nightActions as unknown as string);
      } catch {
        return {} as Record<number, { action: string; target: number | null }>;
      }
    })() as Record<number, { action: string; target: number | null }>;

    nightActions[playerId] = { action: action || "", target: targetId ?? null };

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { nightActions: JSON.stringify(nightActions) },
    });

    // Check if all night-role players have acted
    const room = await prisma.rooms.findFirst({
      where: { gameSessions: { some: { id: sessionId } } },
      include: { gameSessions: true },
    });

    if (room) {
      const alivePlayers = JSON.parse(session.alivePlayers as unknown as string) as number[];
      let playersData: Array<{ role: number | null }> = [];
      try {
        const parsed = JSON.parse(room.players as unknown as string);
        playersData = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : [];
      } catch {
        playersData = [];
      }

      const roles = await prisma.roles.findMany();
      const roleMap = new Map(roles.map((r) => [r.id, r]));

      const NIGHT_ROLE_NAMES = ["seer", "witch", "guard", "预言家", "女巫", "守卫"];
      const rolesWithActions = alivePlayers.filter((pIdx) => {
        const roleId = playersData[pIdx]?.role;
        if (!roleId) return false;
        const role = roleMap.get(roleId);
        if (!role) return false;
        return role.team === "werewolf" || role.priority > 0 ||
          NIGHT_ROLE_NAMES.includes(role.name.toLowerCase()) || NIGHT_ROLE_NAMES.includes(role.name);
      });

      const actedPlayers = Object.keys(nightActions).map(Number);
      const allActed = rolesWithActions.every((pIdx) => actedPlayers.includes(pIdx));

      console.log("Night action check:", {
        alivePlayers,
        rolesWithActions,
        actedPlayers,
        allActed,
      });

      return NextResponse.json({
        success: true,
        message: "Action recorded",
        allActionsComplete: allActed,
        roomCode: room.roomCode,
      });
    }

    return NextResponse.json({ success: true, message: "Action recorded" });
  } catch (error) {
    console.error("Error recording action:", error);
    return NextResponse.json({ success: false, message: "Failed to record action" }, { status: 500 });
  }
}
