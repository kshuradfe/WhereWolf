import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseJsonArray(val: unknown): number[] {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return Array.isArray(val) ? val : [];
}

function parseJsonObject<T extends object>(val: unknown, fallback: T): T {
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return p && typeof p === "object" ? p : fallback;
    } catch { return fallback; }
  }
  return val && typeof val === "object" ? (val as T) : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, playerId, action, targetId } = body;

    if (!sessionId || playerId === undefined || !action) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    if (session.phase !== "election") {
      return NextResponse.json({ success: false, message: "Not in election phase" }, { status: 400 });
    }

    const alive = parseJsonArray(session.alivePlayers as unknown);
    if (!alive.includes(playerId)) {
      return NextResponse.json({ success: false, message: "Player is not alive" }, { status: 400 });
    }

    let candidates = parseJsonArray(session.sheriffCandidates as unknown);
    const electionVotes = parseJsonObject<Record<string, number>>(session.electionVotes as unknown, {});

    // Track which players have made their signup decision (store as negative-encoded opt-outs)
    // We use a separate tracking approach: count total decisions = candidates.length + opt-outs
    // For simplicity, we track opt-outs in electionVotes with a special key pattern "opted_out_<id>"

    switch (action) {
      case "signup": {
        if (session.electionState !== "SIGNUP") {
          return NextResponse.json({ success: false, message: "Signup phase is over" }, { status: 400 });
        }
        if (!candidates.includes(playerId)) {
          candidates.push(playerId);
        }
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { sheriffCandidates: JSON.stringify(candidates) },
        });
        break;
      }

      case "opt_out": {
        if (session.electionState !== "SIGNUP") {
          return NextResponse.json({ success: false, message: "Signup phase is over" }, { status: 400 });
        }
        // Record opt-out decision so we can track completion
        electionVotes[`optout_${playerId}`] = -1;
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { electionVotes: JSON.stringify(electionVotes) },
        });
        break;
      }

      case "withdraw": {
        if (session.electionState !== "SPEAKING") {
          return NextResponse.json({ success: false, message: "Can only withdraw during speaking phase" }, { status: 400 });
        }
        candidates = candidates.filter((c) => c !== playerId);
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { sheriffCandidates: JSON.stringify(candidates) },
        });
        break;
      }

      case "election_vote": {
        if (session.electionState !== "VOTING" && session.electionState !== "PK") {
          return NextResponse.json({ success: false, message: "Not in voting/PK phase" }, { status: 400 });
        }
        if (candidates.includes(playerId)) {
          return NextResponse.json({ success: false, message: "Candidates cannot vote" }, { status: 400 });
        }
        if (targetId === undefined || targetId === null || !candidates.includes(targetId)) {
          return NextResponse.json({ success: false, message: "Invalid vote target" }, { status: 400 });
        }
        electionVotes[String(playerId)] = targetId;
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { electionVotes: JSON.stringify(electionVotes) },
        });
        break;
      }

      default:
        return NextResponse.json({ success: false, message: "Unknown election action" }, { status: 400 });
    }

    // Re-read for completion checks
    const updatedSession = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    const latestCandidates = parseJsonArray(updatedSession?.sheriffCandidates as unknown);
    const latestVotes = parseJsonObject<Record<string, number>>(updatedSession?.electionVotes as unknown, {});

    // Check completions
    let allSignedUp = false;
    let allVoted = false;

    if (session.electionState === "SIGNUP") {
      const signedUpCount = latestCandidates.length;
      const optedOutCount = Object.keys(latestVotes).filter((k) => k.startsWith("optout_")).length;
      allSignedUp = (signedUpCount + optedOutCount) >= alive.length;
    }

    if (session.electionState === "VOTING" || session.electionState === "PK") {
      const voters = alive.filter((p) => !latestCandidates.includes(p));
      const votedCount = voters.filter((v) => latestVotes[String(v)] !== undefined).length;
      allVoted = votedCount >= voters.length;
    }

    return NextResponse.json({
      success: true,
      message: "Election action recorded",
      data: {
        allSignedUp,
        allVoted,
        candidates: latestCandidates,
      },
    });
  } catch (error) {
    console.error("Error processing election action:", error);
    return NextResponse.json({ success: false, message: "Failed to process election action" }, { status: 500 });
  }
}
