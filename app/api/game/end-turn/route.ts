import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseJsonArray(val: unknown): number[] {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return Array.isArray(val) ? val : [];
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, playerId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ success: false, message: "sessionId is required" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    const sess = session as Record<string, unknown>;
    // Only the current speaker (or admin/timer) can end their turn
    if (playerId !== undefined && playerId !== sess.currentSpeakerId) {
      return NextResponse.json({ success: false, message: "Not your turn to speak" }, { status: 403 });
    }

    const queue = parseJsonArray(sess.speakerQueue);

    if (queue.length > 0) {
      const nextSpeaker = queue.shift()!;
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          currentSpeakerId: nextSpeaker,
          speakerQueue: JSON.stringify(queue),
          speakerStartTime: new Date(),
        } as Record<string, unknown>,
      });

      return NextResponse.json({
        success: true,
        data: {
          currentSpeakerId: nextSpeaker,
          speakerQueue: queue,
          speakerStartTime: new Date().toISOString(),
          queueEmpty: false,
        },
      });
    }

    // Queue is empty: all speakers done.
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentSpeakerId: null,
        speakerQueue: JSON.stringify([]),
        speakerStartTime: null,
      } as Record<string, unknown>,
    });

    const phase = session.phase as string;
    let nextAction: string;
    if (phase === "election") {
      nextAction = "advance_election";
    } else if (phase === "day") {
      nextAction = "advance_voting";
    } else {
      nextAction = "none";
    }

    return NextResponse.json({
      success: true,
      data: {
        currentSpeakerId: null,
        speakerQueue: [],
        speakerStartTime: null,
        queueEmpty: true,
        nextAction,
      },
    });
  } catch (error) {
    console.error("Error ending turn:", error);
    return NextResponse.json({ success: false, message: "Failed to end turn" }, { status: 500 });
  }
}
