"use client";

import React from "react";
import Button from "@/components/shared/Button";

interface NightPhaseActionsProps {
  canAct: boolean;
  submitted: boolean;
  target: number | null;
  onSubmitAction: (actionType: string) => void;
  onSkipAction: () => void;
  submitDisabled?: boolean;
  hint?: string;
  roleName?: string;
  wolfTargetName?: string | null;
  witchHealUsed?: boolean;
  witchPoisonUsed?: boolean;
  guardLastTarget?: number | null;
}

export default function NightPhaseActions({
  canAct,
  submitted,
  target,
  onSubmitAction,
  onSkipAction,
  submitDisabled = false,
  hint,
  roleName,
  wolfTargetName,
  witchHealUsed = false,
  witchPoisonUsed = false,
  guardLastTarget,
}: NightPhaseActionsProps) {
  if (submitted) {
    return (
      <div className="p-4 bg-green-900/30 rounded-lg border border-green-500/30">
        <p className="text-green-200 text-sm">✓ Action submitted. Waiting for other players...</p>
      </div>
    );
  }

  if (!canAct) {
    return (
      <div className="p-4 bg-gray-900/30 rounded-lg border border-gray-500/30">
        <p className="text-gray-300 text-sm">Your role has no night action. Rest while others act...</p>
      </div>
    );
  }

  const lowerName = roleName?.toLowerCase() ?? "";
  const isWitch = lowerName === "witch" || roleName === "女巫";
  const isGuard = lowerName === "guard" || roleName === "守卫";

  // ── Witch UI ──
  if (isWitch) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
          <h3 className="text-purple-200 font-semibold mb-2">Night Phase — 女巫</h3>
          {!witchHealUsed && wolfTargetName ? (
            <p className="text-red-300 text-sm mb-2">
              🐺 狼人今晚袭击了：<span className="font-bold">{wolfTargetName}</span>
            </p>
          ) : witchHealUsed ? (
            <p className="text-gray-400 text-sm mb-2">💊 解药已用完，无法得知狼人目标。</p>
          ) : (
            <p className="text-gray-300 text-sm mb-2">🐺 狼人还未行动，请等待...</p>
          )}
          {witchPoisonUsed && (
            <p className="text-gray-400 text-sm mb-1">🧪 毒药已用完。</p>
          )}
          <p className="text-purple-100/80 text-sm">
            {target !== null
              ? '已选择毒药目标。点击「使用毒药」确认。'
              : '你可以使用解药救人，或选择一名玩家使用毒药。'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-green-700 hover:!bg-green-600"
            onClick={() => onSubmitAction("heal")}
            disabled={witchHealUsed || !wolfTargetName || submitDisabled}
          >
            💊 使用解药
          </Button>
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-red-700 hover:!bg-red-600"
            onClick={() => onSubmitAction("poison")}
            disabled={witchPoisonUsed || target === null || submitDisabled}
          >
            🧪 使用毒药
          </Button>
        </div>
        <Button
          className="w-full px-4 py-3 text-sm !bg-gray-600 hover:!bg-gray-500"
          onClick={onSkipAction}
        >
          什么都不做（跳过）
        </Button>
      </div>
    );
  }

  // ── Guard UI ──
  if (isGuard) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
          <h3 className="text-blue-200 font-semibold mb-2">Night Phase — 守卫</h3>
          <p className="text-blue-100/80 text-sm">
            选择一名玩家进行守护。被守护的玩家今晚不会被狼人杀死。
          </p>
          {guardLastTarget !== null && guardLastTarget !== undefined && (
            <p className="text-yellow-300 text-xs mt-1">
              ⚠️ 你昨晚守护的玩家今晚不能再守。
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 px-4 py-3 text-sm"
            onClick={() => onSubmitAction("guard")}
            disabled={target === null || submitDisabled}
          >
            🛡️ 守护
          </Button>
          <Button className="flex-1 px-4 py-3 text-sm !bg-gray-600 hover:!bg-gray-500" onClick={onSkipAction}>
            跳过
          </Button>
        </div>
      </div>
    );
  }

  // ── Default UI (Wolves, Seer, etc.) ──
  return (
    <div className="space-y-3">
      <div className="p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
        <h3 className="text-purple-200 font-semibold mb-2">Night Phase</h3>
        <p className="text-purple-100/80 text-sm">
          {target !== null
            ? "Target selected. Click submit to confirm your action."
            : "Select a player to target with your night action."}
        </p>
        {hint && <p className="text-purple-300 text-xs mt-1">{hint}</p>}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 px-4 py-3 text-sm"
          onClick={() => onSubmitAction("target")}
          disabled={target === null || submitDisabled}
        >
          Submit Action
        </Button>
        <Button className="flex-1 px-4 py-3 text-sm !bg-gray-600 hover:!bg-gray-500" onClick={onSkipAction}>
          Skip
        </Button>
      </div>
    </div>
  );
}
