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

  const isWitch = roleName?.toLowerCase() === "witch" || roleName === "女巫";

  if (isWitch) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
          <h3 className="text-purple-200 font-semibold mb-2">Night Phase — 女巫</h3>
          {wolfTargetName ? (
            <p className="text-red-300 text-sm mb-2">
              🐺 狼人今晚袭击了：<span className="font-bold">{wolfTargetName}</span>
            </p>
          ) : (
            <p className="text-gray-300 text-sm mb-2">🐺 狼人还未行动，请等待...</p>
          )}
          <p className="text-purple-100/80 text-sm">
            {target !== null
              ? `已选择毒药目标。点击"使用毒药"确认。`
              : `你可以使用解药救人，或选择一名玩家使用毒药。`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-green-700 hover:!bg-green-600"
            onClick={() => onSubmitAction("heal")}
            disabled={!wolfTargetName || submitDisabled}
          >
            💊 使用解药
          </Button>
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-red-700 hover:!bg-red-600"
            onClick={() => onSubmitAction("poison")}
            disabled={target === null || submitDisabled}
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

  // Default UI for all other roles
  return (
    <div className="space-y-3">
      <div className="p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
        <h3 className="text-purple-200 font-semibold mb-2">Night Phase</h3>
        <p className="text-purple-100/80 text-sm">
          {target !== null
            ? `Target selected. Click submit to confirm your action.`
            : `Select a player to target with your night action.`}
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
