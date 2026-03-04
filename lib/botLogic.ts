import { CharacterType, PlayerType } from "@/lib/types";

export const BOT_NAME_PREFIX = "Bot ";

// ─── 基础工具 ─────────────────────────────────────────────

export function isBotPlayer(name: string | null): boolean {
  if (!name) return false;
  return name.startsWith(BOT_NAME_PREFIX);
}

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomDelay(min = 800, max = 2000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

// ─── 夜间行动 ─────────────────────────────────────────────

export interface BotAction {
  action: string;
  targetId: number | null;
}

/**
 * 狼人：wolf_kill
 * 女巫：heal / poison / skip（受 witchHealUsed、witchPoisonUsed、wolfVictimId 影响）
 * 预言家：target（验人）
 * 守卫：由 getBotGuardTarget 单独处理，此处返回 skip
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

  // 狼人
  if (role.team === "werewolf") {
    const nonWolfAlive = otherAlive.filter((i) => {
      const r = allCharacters.find((c) => c.id === allPlayers[i]?.role);
      return r?.team !== "werewolf";
    });
    const targets = nonWolfAlive.length > 0 ? nonWolfAlive : otherAlive;
    return { action: "wolf_kill", targetId: targets.length > 0 ? randomFrom(targets) : null };
  }

  // 女巫：有人被刀且没用解药时 50% 救；否则 50% 盲毒
  const isWitch = role.name.toLowerCase() === "witch" || role.name === "女巫";
  if (isWitch) {
    if (!witchHealUsed && wolfVictimId !== null && Math.random() < 0.5) {
      return { action: "heal", targetId: wolfVictimId };
    }
    if (!witchPoisonUsed && otherAlive.length > 0 && Math.random() < 0.5) {
      return { action: "poison", targetId: randomFrom(otherAlive) };
    }
    return { action: "skip", targetId: null };
  }

  // 守卫：由 getBotGuardTarget 单独处理
  const isGuard = role.name.toLowerCase() === "guard" || role.name === "守卫";
  if (isGuard) {
    return { action: "skip", targetId: null };
  }

  // 预言家等神职：target（验人）
  if (role.priority > 0) {
    return {
      action: "target",
      targetId: otherAlive.length > 0 ? randomFrom(otherAlive) : null,
    };
  }

  return { action: "skip", targetId: null };
}

/**
 * 守卫：不能连续两晚守护同一个人
 */
export function getBotGuardTarget(
  botIndex: number,
  alivePlayers: number[],
  lastTarget: number | null
): number | null {
  const validTargets = alivePlayers.filter((id) => id !== lastTarget);
  return validTargets.length > 0 ? randomFrom(validTargets) : null;
}

/**
 * 猎人开枪：50% 概率开枪，50% 概率放弃
 */
export function getBotHunterShootTarget(hunterIndex: number, alivePlayers: number[]): number | null {
  if (Math.random() > 0.5) return null;
  const validTargets = alivePlayers.filter((id) => id !== hunterIndex);
  return validTargets.length > 0 ? randomFrom(validTargets) : null;
}

// ─── 投票 ─────────────────────────────────────────────────

export function getBotVoteTarget(botIndex: number, alivePlayers: number[]): number | null {
  const targets = alivePlayers.filter((i) => i !== botIndex);
  return targets.length > 0 ? randomFrom(targets) : null;
}

// ─── 竞选警长 ─────────────────────────────────────────────

/** 约 40% 概率上警 */
export function getBotElectionSignup(): boolean {
  return Math.random() < 0.4;
}

/** 警下投票：从候选人中随机投一票 */
export function getBotElectionVote(candidates: number[]): number | null {
  if (!candidates || candidates.length === 0) return null;
  return randomFrom(candidates);
}
