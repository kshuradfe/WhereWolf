import { CharacterType, PlayerType } from "@/lib/types";

export const BOT_NAME_PREFIX = "Bot ";

export function isBotPlayer(name: string | null): boolean {
  if (!name) return false;
  return name.startsWith(BOT_NAME_PREFIX);
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(min = 300, max = 800): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

export interface BotAction {
  action: string;
  targetId: number | null;
}

/**
 * Decide what night action a bot should take.
 *
 * Wolves: action = "wolf_kill"
 * Witch:  respects witchHealUsed / witchPoisonUsed
 * Guard:  handled separately via getBotGuardTarget
 * Seer / others with priority > 0: action = "target"
 * Priority 0: skip
 */
export function getBotNightAction(
  botIndex: number,
  role: CharacterType,
  alivePlayers: number[],
  allPlayers: PlayerType[],
  allCharacters: CharacterType[],
  wolfVictimId: number | null = null,
  witchHealUsed = false,
  witchPoisonUsed = false
): BotAction {
  const otherAlive = alivePlayers.filter((i) => i !== botIndex);

  // Wolves
  if (role.team === "werewolf") {
    const nonWolfAlive = otherAlive.filter((i) => {
      const r = allCharacters.find((c) => c.id === allPlayers[i]?.role);
      return r?.team !== "werewolf";
    });
    const targets = nonWolfAlive.length > 0 ? nonWolfAlive : otherAlive;
    return { action: "wolf_kill", targetId: targets.length > 0 ? randomFrom(targets) : null };
  }

  // Witch
  const isWitch = role.name.toLowerCase() === "witch" || role.name === "女巫";
  if (isWitch) {
    // 50% chance to heal if wolf victim is known and heal not used
    if (!witchHealUsed && wolfVictimId !== null && Math.random() < 0.5) {
      return { action: "heal", targetId: wolfVictimId };
    }
    // 20% chance to poison a random player if poison not used
    if (!witchPoisonUsed && otherAlive.length > 0 && Math.random() < 0.2) {
      return { action: "poison", targetId: randomFrom(otherAlive) };
    }
    return { action: "skip", targetId: null };
  }

  // Guard is handled via getBotGuardTarget, but if called here anyway, skip
  const isGuard = role.name.toLowerCase() === "guard" || role.name === "守卫";
  if (isGuard) {
    return { action: "skip", targetId: null };
  }

  // Other roles with night action (Seer, etc.)
  if (role.priority > 0) {
    return {
      action: "target",
      targetId: otherAlive.length > 0 ? randomFrom(otherAlive) : null,
    };
  }

  return { action: "skip", targetId: null };
}

/**
 * Guard bot: pick a random alive player (including self), excluding last night's target.
 */
export function getBotGuardTarget(
  botIndex: number,
  alivePlayers: number[],
  lastGuardTarget: number | null
): number | null {
  const valid = alivePlayers.filter((i) => i !== lastGuardTarget);
  return valid.length > 0 ? randomFrom(valid) : null;
}

/**
 * Voting: pick a random alive player other than self.
 */
export function getBotVoteTarget(botIndex: number, alivePlayers: number[]): number | null {
  const targets = alivePlayers.filter((i) => i !== botIndex);
  return targets.length > 0 ? randomFrom(targets) : null;
}

/**
 * Hunter shoot: pick a random alive player other than self.
 */
export function getBotHunterShootTarget(hunterIndex: number, alivePlayers: number[]): number | null {
  const targets = alivePlayers.filter((i) => i !== hunterIndex);
  return targets.length > 0 ? randomFrom(targets) : null;
}

export { randomDelay };
