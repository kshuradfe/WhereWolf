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
 * Wolves: action = "wolf_kill", target = random non-wolf alive player
 * Witch:  50% chance to heal the wolf victim (action = "heal"), otherwise skip
 * Others with priority > 0: action = "target", random alive non-self player
 * Priority === 0 (Villager, Hunter, etc.): skip
 */
export function getBotNightAction(
  botIndex: number,
  role: CharacterType,
  alivePlayers: number[],
  allPlayers: PlayerType[],
  allCharacters: CharacterType[],
  wolfVictimId: number | null = null
): BotAction {
  const otherAlive = alivePlayers.filter((i) => i !== botIndex);

  if (role.team === "werewolf") {
    const nonWolfAlive = otherAlive.filter((i) => {
      const r = allCharacters.find((c) => c.id === allPlayers[i]?.role);
      return r?.team !== "werewolf";
    });
    const targets = nonWolfAlive.length > 0 ? nonWolfAlive : otherAlive;
    return { action: "wolf_kill", targetId: targets.length > 0 ? randomFrom(targets) : null };
  }

  const isWitch = role.name.toLowerCase() === "witch" || role.name === "女巫";
  if (isWitch) {
    // Bot witch: 50 % chance to save the wolf's victim if there is one
    if (wolfVictimId !== null && Math.random() < 0.5) {
      return { action: "heal", targetId: wolfVictimId };
    }
    return { action: "skip", targetId: null };
  }

  if (role.priority > 0) {
    return {
      action: "target",
      targetId: otherAlive.length > 0 ? randomFrom(otherAlive) : null,
    };
  }

  // No night action (Villager, Hunter after priority=0 fix, etc.)
  return { action: "skip", targetId: null };
}

/**
 * Decide who a bot votes for during the voting phase.
 * Simply picks a random alive player that is not itself.
 */
export function getBotVoteTarget(botIndex: number, alivePlayers: number[]): number | null {
  const targets = alivePlayers.filter((i) => i !== botIndex);
  return targets.length > 0 ? randomFrom(targets) : null;
}

export { randomDelay };
