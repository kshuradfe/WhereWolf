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
 * Werewolves target a random non-werewolf alive player.
 * Roles with priority > 0 (Seer, Guard, Witch, Fox…) target a random alive non-self player.
 * Roles with priority === 0 (Villager, Idiot, etc.) skip.
 */
export function getBotNightAction(
  botIndex: number,
  role: CharacterType,
  alivePlayers: number[],
  allPlayers: PlayerType[],
  allCharacters: CharacterType[]
): BotAction {
  const otherAlive = alivePlayers.filter((i) => i !== botIndex);

  if (role.team === "werewolf") {
    // Pick a random non-werewolf alive player
    const nonWolfAlive = otherAlive.filter((i) => {
      const r = allCharacters.find((c) => c.id === allPlayers[i]?.role);
      return r?.team !== "werewolf";
    });
    const targets = nonWolfAlive.length > 0 ? nonWolfAlive : otherAlive;
    return { action: "target", targetId: targets.length > 0 ? randomFrom(targets) : null };
  }

  if (role.priority > 0) {
    // Has a night action — pick random alive non-self player
    return {
      action: "target",
      targetId: otherAlive.length > 0 ? randomFrom(otherAlive) : null,
    };
  }

  // No night action
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
