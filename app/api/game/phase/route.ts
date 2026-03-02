import { NextRequest, NextResponse } from "next/server";
import { GamePhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

async function isHunterPlayer(playerIdx: number, roomId: number): Promise<boolean> {
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

/**
 * After deaths occur, check if sheriff is among the newly dead.
 * If so, route to pass_badge and store the intended next phase.
 */
function shouldPassBadge(
  sheriffId: number | null,
  newlyDead: Set<number> | number[],
  badgeDestroyed: boolean
): boolean {
  if (sheriffId === null || badgeDestroyed) return false;
  const deadSet = newlyDead instanceof Set ? newlyDead : new Set(newlyDead);
  return deadSet.has(sheriffId);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, hunterTarget, badgeTarget } = body;

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
    const extraUpdate: Record<string, unknown> = {};

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

        let wolfKillSaved = false;
        if (wolfTarget !== null && guardTarget !== null && guardTarget === wolfTarget) {
          wolfKillSaved = true;
        }
        if (wolfTarget !== null && healTarget !== null && healTarget === wolfTarget) {
          if (wolfKillSaved) wolfKillSaved = false; // 同守同救 → dies
          else wolfKillSaved = true;
        }

        const playersToDie = new Set<number>();
        if (wolfTarget !== null && !wolfKillSaved) playersToDie.add(wolfTarget);
        if (poisonTarget !== null) playersToDie.add(poisonTarget);

        playersToDie.forEach((pid) => {
          if (alive.includes(pid)) {
            alive = alive.filter((p) => p !== pid);
            dead = Array.from(new Set([...dead, pid]));
          }
        });

        Object.assign(extraUpdate, {
          alivePlayers: JSON.stringify(alive),
          deadPlayers: JSON.stringify(dead),
          nightActions: JSON.stringify({}),
          guardLastTarget: guardTarget,
        });
        if (healTarget !== null) extraUpdate.witchHealUsed = true;
        if (poisonTarget !== null) extraUpdate.witchPoisonUsed = true;

        await prisma.gameSession.update({ where: { id: sessionId }, data: extraUpdate });

        let hunterShoots = false;
        for (const pid of playersToDie) {
          const isHunter = await isHunterPlayer(pid, session.roomId);
          if (isHunter) {
            const wasPoisoned = poisonTarget === pid && (wolfTarget !== pid || wolfKillSaved);
            if (!wasPoisoned) hunterShoots = true;
          }
        }

        winner = await checkWinCondition(alive, session.roomId);
        if (winner) {
          nextPhase = "ended";
        } else if (hunterShoots) {
          nextPhase = "hunter_shoot";
        } else if (shouldPassBadge(session.sheriffId, playersToDie, session.sheriffBadgeDestroyed)) {
          // Sheriff died at night — route to pass_badge first
          const intendedPhase = session.dayNumber === 0 ? "election" : "day";
          extraUpdate.pendingPhase = intendedPhase;
          nextPhase = "pass_badge";
        } else if (session.dayNumber === 0) {
          // First night → election
          nextPhase = "election";
          extraUpdate.electionState = "SIGNUP";
          extraUpdate.sheriffCandidates = JSON.stringify([]);
          extraUpdate.electionVotes = JSON.stringify({});
        } else {
          nextPhase = "day";
        }
        break;
      }

      // ─── DAY → VOTING ─────────────────────────────────────────
      case "day": {
        nextPhase = "voting";
        break;
      }

      // ─── VOTING RESOLUTION (with 1.5x sheriff weight) ─────────
      case "voting": {
        const votes = parseJsonObject<Record<string, number>>(session.votes as unknown, {});

        const tally = new Map<number, number>();
        Object.entries(votes).forEach(([voterId, target]) => {
          if (typeof target === "number") {
            const weight = Number(voterId) === session.sheriffId ? 1.5 : 1;
            tally.set(target, (tally.get(target) || 0) + weight);
          }
        });

        let eliminated: number | null = null;
        if (tally.size > 0) {
          const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
          const [topTarget, topCount] = entries[0];
          const isTie = entries.length > 1 && entries[1][1] === topCount;
          if (!isTie && topCount > 0) eliminated = topTarget;
        }

        const votingDead = new Set<number>();
        if (eliminated !== null && alive.includes(eliminated)) {
          alive = alive.filter((p) => p !== eliminated);
          dead = Array.from(new Set([...dead, eliminated]));
          votingDead.add(eliminated);
        }

        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            alivePlayers: JSON.stringify(alive),
            deadPlayers: JSON.stringify(dead),
            votes: JSON.stringify({}),
          },
        });

        let hunterShoots = false;
        if (eliminated !== null) {
          hunterShoots = await isHunterPlayer(eliminated, session.roomId);
        }

        winner = await checkWinCondition(alive, session.roomId);
        if (winner) {
          nextPhase = "ended";
        } else if (hunterShoots) {
          nextPhase = "hunter_shoot";
        } else if (shouldPassBadge(session.sheriffId, votingDead, session.sheriffBadgeDestroyed)) {
          extraUpdate.pendingPhase = "night";
          nextPhase = "pass_badge";
        } else {
          nextPhase = "night";
          nextDay += 1;
        }
        break;
      }

      // ─── HUNTER SHOOT RESOLUTION ──────────────────────────────
      case "hunter_shoot": {
        const targetIdx = typeof hunterTarget === "number" ? hunterTarget : null;
        const hunterDead = new Set<number>();
        if (targetIdx !== null && alive.includes(targetIdx)) {
          alive = alive.filter((p) => p !== targetIdx);
          dead = Array.from(new Set([...dead, targetIdx]));
          hunterDead.add(targetIdx);

          await prisma.gameSession.update({
            where: { id: sessionId },
            data: {
              alivePlayers: JSON.stringify(alive),
              deadPlayers: JSON.stringify(dead),
            },
          });
        }

        winner = await checkWinCondition(alive, session.roomId);
        if (winner) {
          nextPhase = "ended";
        } else if (shouldPassBadge(session.sheriffId, hunterDead, session.sheriffBadgeDestroyed)) {
          extraUpdate.pendingPhase = "day";
          nextPhase = "pass_badge";
        } else {
          nextPhase = "day";
        }
        break;
      }

      // ─── ELECTION SUB-PHASE TRANSITIONS ───────────────────────
      case "election": {
        const candidates = parseJsonArray(session.sheriffCandidates as unknown);
        const electionVotes = parseJsonObject<Record<string, number>>(session.electionVotes as unknown, {});

        switch (session.electionState) {
          case "SIGNUP": {
            if (candidates.length === 0) {
              // Nobody signed up → no sheriff, go to day
              extraUpdate.sheriffBadgeDestroyed = true;
              nextPhase = "day";
            } else if (candidates.length === 1) {
              // Auto-elect the single candidate
              extraUpdate.sheriffId = candidates[0];
              extraUpdate.electionState = null;
              nextPhase = "day";
            } else {
              extraUpdate.electionState = "SPEAKING";
              nextPhase = "election";
            }
            break;
          }

          case "SPEAKING": {
            // After speaking phase, check remaining candidates (withdrawals already applied via election API)
            if (candidates.length === 0) {
              extraUpdate.sheriffBadgeDestroyed = true;
              extraUpdate.electionState = null;
              nextPhase = "day";
            } else if (candidates.length === 1) {
              extraUpdate.sheriffId = candidates[0];
              extraUpdate.electionState = null;
              nextPhase = "day";
            } else {
              extraUpdate.electionState = "VOTING";
              extraUpdate.electionVotes = JSON.stringify({});
              nextPhase = "election";
            }
            break;
          }

          case "VOTING": {
            // Tally election votes
            const tally = new Map<number, number>();
            Object.values(electionVotes).forEach((target) => {
              if (typeof target === "number") {
                tally.set(target, (tally.get(target) || 0) + 1);
              }
            });

            if (tally.size === 0) {
              extraUpdate.sheriffBadgeDestroyed = true;
              extraUpdate.electionState = null;
              nextPhase = "day";
              break;
            }

            const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
            const topCount = entries[0][1];
            const tied = entries.filter(([, count]) => count === topCount);

            if (tied.length === 1) {
              extraUpdate.sheriffId = tied[0][0];
              extraUpdate.electionState = null;
              nextPhase = "day";
            } else {
              // Tie → PK between tied candidates
              extraUpdate.electionState = "PK";
              extraUpdate.sheriffCandidates = JSON.stringify(tied.map(([id]) => id));
              extraUpdate.electionVotes = JSON.stringify({});
              nextPhase = "election";
            }
            break;
          }

          case "PK": {
            const tally = new Map<number, number>();
            Object.values(electionVotes).forEach((target) => {
              if (typeof target === "number") {
                tally.set(target, (tally.get(target) || 0) + 1);
              }
            });

            if (tally.size === 0) {
              // No votes cast in PK → badge lost
              extraUpdate.sheriffBadgeDestroyed = true;
              extraUpdate.electionState = null;
              nextPhase = "day";
              break;
            }

            const entries = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
            const topCount = entries[0][1];
            const tied = entries.filter(([, count]) => count === topCount);

            if (tied.length === 1) {
              extraUpdate.sheriffId = tied[0][0];
            } else {
              // Still tied → badge lost
              extraUpdate.sheriffBadgeDestroyed = true;
            }
            extraUpdate.electionState = null;
            nextPhase = "day";
            break;
          }

          default:
            nextPhase = "day";
            break;
        }
        break;
      }

      // ─── PASS BADGE RESOLUTION ────────────────────────────────
      case "pass_badge": {
        const target = badgeTarget !== undefined ? badgeTarget : null;
        if (target !== null && alive.includes(target)) {
          extraUpdate.sheriffId = target;
        } else {
          extraUpdate.sheriffId = null;
          extraUpdate.sheriffBadgeDestroyed = true;
        }

        // Resume to the phase that was deferred
        const pending = session.pendingPhase as string | null;
        extraUpdate.pendingPhase = null;

        if (pending === "night") {
          nextPhase = "night";
          nextDay += 1;
        } else if (pending === "election") {
          nextPhase = "election";
          extraUpdate.electionState = "SIGNUP";
          extraUpdate.sheriffCandidates = JSON.stringify([]);
          extraUpdate.electionVotes = JSON.stringify({});
        } else if (pending === "day") {
          nextPhase = "day";
        } else {
          nextPhase = "day";
        }

        winner = await checkWinCondition(alive, session.roomId);
        if (winner) nextPhase = "ended";
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
        ...extraUpdate,
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
