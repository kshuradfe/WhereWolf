import { NextRequest, NextResponse } from "next/server";
import { GamePhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, message: "Session ID is required" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    // Phase transition logic
    let nextPhase: GamePhase = session.phase;
    let nextDay = session.dayNumber;
    let winner: string | null = null;

    // We will also resolve votes when transitioning from voting -> night
    switch (session.phase) {
      case "night": {
        let nightActions: Record<string, { action: string; target: number | null }> = {};
        try {
          nightActions = JSON.parse(session.nightActions as unknown as string);
        } catch {
          nightActions = {};
        }

        let alive: number[] = [];
        let dead: number[] = [];
        try {
          alive = JSON.parse(session.alivePlayers as unknown as string) as number[];
        } catch {
          alive = [];
        }
        try {
          dead = JSON.parse(session.deadPlayers as unknown as string) as number[];
        } catch {
          dead = [];
        }

        // Separate wolf kill, witch heal, and witch poison
        let wolfTarget: number | null = null;
        let healedTarget: number | null = null;
        let poisonedTarget: number | null = null;

        Object.values(nightActions).forEach((act) => {
          if (act.action === "wolf_kill" && act.target !== null) wolfTarget = act.target;
          else if (act.action === "heal" && act.target !== null) healedTarget = act.target;
          else if (act.action === "poison" && act.target !== null) poisonedTarget = act.target;
        });

        const playersToDie = new Set<number>();

        // Wolf kill is cancelled if witch healed the same target
        if (wolfTarget !== null && wolfTarget !== healedTarget) {
          playersToDie.add(wolfTarget);
        }
        // Witch poison is unconditional
        if (poisonedTarget !== null) {
          playersToDie.add(poisonedTarget);
        }

        playersToDie.forEach((playerId) => {
          if (alive.includes(playerId)) {
            alive = alive.filter((p) => p !== playerId);
            dead = Array.from(new Set([...dead, playerId]));
          }
        });

        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            alivePlayers: JSON.stringify(alive),
            deadPlayers: JSON.stringify(dead),
            nightActions: JSON.stringify({}),
          },
        });

        nextPhase = "day";
        break;
      }
      case "day": {
        nextPhase = "voting";
        break;
      }
      case "voting": {
        // Resolve votes
        let votes: Record<string, number> = {};
        try {
          votes = JSON.parse(session.votes as unknown as string) as Record<string, number>;
        } catch {
          votes = {};
        }

        let alive: number[] = [];
        let dead: number[] = [];
        try {
          alive = JSON.parse(session.alivePlayers as unknown as string) as number[];
        } catch {
          alive = [];
        }
        try {
          dead = JSON.parse(session.deadPlayers as unknown as string) as number[];
        } catch {
          dead = [];
        }

        const tally = new Map<number, number>();
        Object.values(votes).forEach((target) => {
          if (typeof target === "number") tally.set(target, (tally.get(target) || 0) + 1);
        });
        let eliminated: number | null = null;
        if (tally.size > 0) {
          const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
          const [topTarget, topCount] = entries[0];
          const isTie = entries.length > 1 && entries[1][1] === topCount;
          if (!isTie && topCount > 0) {
            eliminated = topTarget;
          }
        }

        if (eliminated !== null && alive.includes(eliminated)) {
          alive = alive.filter((p) => p !== eliminated);
          dead = Array.from(new Set([...dead, eliminated]));
        }

        // Clear votes when leaving voting phase
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            alivePlayers: JSON.stringify(alive),
            deadPlayers: JSON.stringify(dead),
            votes: JSON.stringify({}),
          },
        });

        nextPhase = "night";
        nextDay += 1;
        break;
      }
      default:
        break;
    }

    // Check win condition (simplified logic)
    const alivePlayers = JSON.parse(session.alivePlayers as string);
    if (alivePlayers.length <= 2) {
      winner = "werewolf"; // Simplified: werewolves win if 2 or fewer alive
      nextPhase = "ended";
    }

    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        phase: nextPhase,
        dayNumber: nextDay,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        phase: nextPhase,
        dayNumber: nextDay,
        winner,
        session: updatedSession,
      },
    });
  } catch (error) {
    console.error("Error advancing phase:", error);
    return NextResponse.json({ success: false, message: "Failed to advance phase" }, { status: 500 });
  }
}
