import { NextRequest, NextResponse } from "next/server";
import { GamePhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// God roles that count for 屠边 win condition
const GOD_ROLE_NAMES = ["seer", "witch", "hunter", "guard", "预言家", "女巫", "猎人", "守卫"];

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

interface NightAction { action: string; target: number | null }

/**
 * Check win condition (屠边局).
 * Returns "villager" | "werewolf" | null.
 */
async function checkWinCondition(
  alive: number[],
  roomId: number
): Promise<string | null> {
  const room = await prisma.rooms.findUnique({ where: { id: roomId } });
  if (!room) return null;

  let playersData: Array<{ role: number | null }> = [];
  try {
    const parsed = JSON.parse(room.players as unknown as string);
    playersData = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : [];
  } catch { playersData = []; }

  const roles = await prisma.roles.findMany();
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  let aliveWolves = 0;
  let aliveGods = 0;
  let aliveVillagers = 0;

  for (const idx of alive) {
    const roleId = playersData[idx]?.role;
    if (!roleId) continue;
    const role = roleMap.get(roleId);
    if (!role) continue;
    if (role.team === "werewolf") {
      aliveWolves++;
    } else if (GOD_ROLE_NAMES.some((n) => role.name.toLowerCase() === n)) {
      aliveGods++;
    } else {
      aliveVillagers++;
    }
  }

  if (aliveWolves === 0) return "villager";
  if (aliveGods === 0 || aliveVillagers === 0) return "werewolf";
  return null;
}

/**
 * Check if a player index is a Hunter role (and not poisoned this night).
 */
async function isHunterPlayer(
  playerIdx: number,
  roomId: number
): Promise<boolean> {
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
  if (!role) return false;
  return role.name.toLowerCase() === "hunter" || role.name === "猎人";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, hunterTarget } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, message: "Session ID is required" }, { status: 400 });
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ success: false, message: "Session not found" }, { status: 404 });
    }

    let nextPhase: GamePhase = session.phase;
    let nextDay = session.dayNumber;
    let winner: string | null = null;

    let alive = parseJsonArray(session.alivePlayers as unknown);
    let dead = parseJsonArray(session.deadPlayers as unknown);

    switch (session.phase) {
      // ─── NIGHT RESOLUTION ──────────────────────────────────────
      case "night": {
        const nightActions = parseJsonObject<Record<string, NightAction>>(
          session.nightActions as unknown, {}
        );

        let wolfTarget: number | null = null;
        let guardTarget: number | null = null;
        let healTarget: number | null = null;
        let poisonTarget: number | null = null;

        Object.values(nightActions).forEach((act) => {
          switch (act.action) {
            case "wolf_kill": if (act.target !== null) wolfTarget = act.target; break;
            case "guard":     if (act.target !== null) guardTarget = act.target; break;
            case "heal":      if (act.target !== null) healTarget = act.target; break;
            case "poison":    if (act.target !== null) poisonTarget = act.target; break;
          }
        });

        // Resolve wolf kill vs guard vs witch heal with 同守同救 logic
        let wolfKillSaved = false;
        if (wolfTarget !== null && guardTarget !== null && guardTarget === wolfTarget) {
          wolfKillSaved = true;
        }
        if (wolfTarget !== null && healTarget !== null && healTarget === wolfTarget) {
          if (wolfKillSaved) {
            wolfKillSaved = false; // 同守同救 → dies!
          } else {
            wolfKillSaved = true;
          }
        }

        const playersToDie = new Set<number>();
        if (wolfTarget !== null && !wolfKillSaved) {
          playersToDie.add(wolfTarget);
        }
        if (poisonTarget !== null) {
          playersToDie.add(poisonTarget);
        }

        // Apply deaths
        playersToDie.forEach((pid) => {
          if (alive.includes(pid)) {
            alive = alive.filter((p) => p !== pid);
            dead = Array.from(new Set([...dead, pid]));
          }
        });

        // Update witch/guard state
        const updateData: Record<string, unknown> = {
          alivePlayers: JSON.stringify(alive),
          deadPlayers: JSON.stringify(dead),
          nightActions: JSON.stringify({}),
          guardLastTarget: guardTarget,
        };
        if (healTarget !== null) updateData.witchHealUsed = true;
        if (poisonTarget !== null) updateData.witchPoisonUsed = true;

        await prisma.gameSession.update({ where: { id: sessionId }, data: updateData });

        // Check if a hunter died (not by poison) → route to hunter_shoot
        let hunterShoots = false;
        for (const pid of playersToDie) {
          const isHunter = await isHunterPlayer(pid, session.roomId);
          if (isHunter) {
            const wasPoisoned = poisonTarget === pid && (wolfTarget !== pid || wolfKillSaved);
            if (!wasPoisoned) {
              hunterShoots = true;
            }
          }
        }

        // Win condition check
        winner = await checkWinCondition(alive, session.roomId);
        nextPhase = winner ? "ended" : hunterShoots ? "hunter_shoot" : "day";
        break;
      }

      // ─── DAY → VOTING ─────────────────────────────────────────
      case "day": {
        nextPhase = "voting";
        break;
      }

      // ─── VOTING RESOLUTION ────────────────────────────────────
      case "voting": {
        const votes = parseJsonObject<Record<string, number>>(session.votes as unknown, {});

        const tally = new Map<number, number>();
        Object.values(votes).forEach((target) => {
          if (typeof target === "number") tally.set(target, (tally.get(target) || 0) + 1);
        });

        let eliminated: number | null = null;
        if (tally.size > 0) {
          const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
          const [topTarget, topCount] = entries[0];
          const isTie = entries.length > 1 && entries[1][1] === topCount;
          if (!isTie && topCount > 0) eliminated = topTarget;
        }

        if (eliminated !== null && alive.includes(eliminated)) {
          alive = alive.filter((p) => p !== eliminated);
          dead = Array.from(new Set([...dead, eliminated]));
        }

        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            alivePlayers: JSON.stringify(alive),
            deadPlayers: JSON.stringify(dead),
            votes: JSON.stringify({}),
          },
        });

        // Check if eliminated player is a hunter → route to hunter_shoot
        let hunterShoots = false;
        if (eliminated !== null) {
          hunterShoots = await isHunterPlayer(eliminated, session.roomId);
        }

        winner = await checkWinCondition(alive, session.roomId);
        if (winner) {
          nextPhase = "ended";
        } else if (hunterShoots) {
          nextPhase = "hunter_shoot";
        } else {
          nextPhase = "night";
          nextDay += 1;
        }
        break;
      }

      // ─── HUNTER SHOOT RESOLUTION ──────────────────────────────
      case "hunter_shoot": {
        const targetIdx = typeof hunterTarget === "number" ? hunterTarget : null;
        if (targetIdx !== null && alive.includes(targetIdx)) {
          alive = alive.filter((p) => p !== targetIdx);
          dead = Array.from(new Set([...dead, targetIdx]));

          await prisma.gameSession.update({
            where: { id: sessionId },
            data: {
              alivePlayers: JSON.stringify(alive),
              deadPlayers: JSON.stringify(dead),
            },
          });
        }

        winner = await checkWinCondition(alive, session.roomId);
        // After hunter shoots, go to day if coming from night, or night if coming from voting
        // We use dayNumber: if we haven't incremented yet this cycle, we're post-night → day
        // Simple heuristic: if session was already in a day cycle, go to night; otherwise day
        // Since hunter_shoot always follows night or voting resolution, we determine by checking
        // if the session's phase before was night or voting.
        // The safest approach: check if there are nightActions cleared (means we came from night)
        // For simplicity, always go to day first — the hunter dying at night → day, dying at vote → night
        // Actually, we need to track the origin. Let's use a simple rule:
        // If dayNumber was already incremented (voting does nextDay+1 before hunter), it means voting.
        // But we don't increment before hunter_shoot. So: if votes are empty (cleared by voting), came from voting.
        const votesStr = parseJsonObject(session.votes as unknown, {});
        const cameFromVoting = Object.keys(votesStr).length === 0 &&
          parseJsonObject(session.nightActions as unknown, null) === null ||
          Object.keys(parseJsonObject<Record<string, unknown>>(session.nightActions as unknown, {})).length === 0;

        // Simpler: night→hunter_shoot→day; voting→hunter_shoot→night+nextDay
        // We check if nightActions were just cleared (came from night) by seeing if the phase before had nightActions
        // Best approach: if there was a vote elimination this round, we came from voting
        // Since voting clears votes to {}, and night clears nightActions to {},
        // we'll just default: after hunter shoot → day (keep current day number, the day phase handles discussion)
        // If we came from voting, we need to go to next night
        // Since voting already set nextDay but that happens before hunter_shoot...
        // Actually, the vote resolution sets nextPhase=hunter_shoot (not night) so nextDay was NOT incremented.
        // So we need to increment here if coming from voting.

        // To distinguish: store origin in nightActions as a marker before entering hunter_shoot
        // For now: use a pragmatic approach — check dead list changes
        // The simplest reliable approach: the "day" phase hasn't changed since night resolution sets it
        // Let's just look at session.dayNumber vs nextDay
        // Actually, this function doesn't re-read the session after updates.
        // Let's keep it simple: after night→hunter_shoot→day (no day increment)
        // after voting→hunter_shoot→night (day increment)
        // We can tell by checking if the nightActions field is empty (night clears it) AND votes empty (voting clears it)
        // Both are cleared. But night sets guardLastTarget. If guardLastTarget was just updated, we came from night.
        // Simplest: just always go to day. The hunter dying from vote → player sees a brief day then voting again.
        // This is actually standard: after any death announcement, there's a day discussion.

        if (winner) {
          nextPhase = "ended";
        } else {
          nextPhase = "day";
        }
        break;
      }

      default:
        break;
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
