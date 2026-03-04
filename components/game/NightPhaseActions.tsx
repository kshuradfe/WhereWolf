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
      <div className="p-2.5 bg-green-900/30 rounded-xl border border-green-500/20">
        <p className="text-green-300 text-xs">✓ 已提交，等待其他玩家...</p>
      </div>
    );
  }

  if (!canAct) {
    return (
      <div className="p-2.5 bg-slate-800/40 rounded-xl border border-white/10">
        <p className="text-white/50 text-xs">你的角色无需夜晚行动，等待其他人...</p>
      </div>
    );
  }

  const lowerName = roleName?.toLowerCase() ?? "";
  const isWitch = lowerName === "witch" || roleName === "女巫";
  const isGuard = lowerName === "guard" || roleName === "守卫";

  // ── Witch ──
  if (isWitch) {
    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-purple-900/30 rounded-xl border border-purple-500/20">
          <p className="text-purple-200 text-xs font-semibold mb-1">🌙 女巫 — 夜晚行动</p>
          {!witchHealUsed && wolfTargetName ? (
            <p className="text-red-300 text-[11px] mb-1">🐺 狼人今晚袭击了：<span className="font-bold">{wolfTargetName}</span></p>
          ) : witchHealUsed ? (
            <p className="text-white/40 text-[11px] mb-1">💊 解药已用完。</p>
          ) : (
            <p className="text-white/40 text-[11px] mb-1">🐺 狼人还未行动，请等待...</p>
          )}
          {witchPoisonUsed && <p className="text-white/40 text-[11px]">🧪 毒药已用完。</p>}
          <p className="text-purple-100/70 text-[11px]">
            {target !== null ? "已选择毒药目标，点击「使用毒药」确认。" : "可使用解药救人，或选择玩家使用毒药。"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 px-3 py-2 text-xs !bg-green-700 hover:!bg-green-600"
            onClick={() => onSubmitAction("heal")}
            disabled={witchHealUsed || !wolfTargetName || submitDisabled}
          >
            💊 解药
          </Button>
          <Button
            className="flex-1 px-3 py-2 text-xs !bg-red-700 hover:!bg-red-600"
            onClick={() => onSubmitAction("poison")}
            disabled={witchPoisonUsed || target === null || submitDisabled}
          >
            🧪 毒药
          </Button>
        </div>
        <Button className="w-full px-3 py-2 text-xs !bg-gray-600 hover:!bg-gray-500" onClick={onSkipAction}>
          跳过（什么都不做）
        </Button>
      </div>
    );
  }

  // ── Guard ──
  if (isGuard) {
    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-blue-900/30 rounded-xl border border-blue-500/20">
          <p className="text-blue-200 text-xs font-semibold mb-1">🌙 守卫 — 夜晚行动</p>
          <p className="text-blue-100/75 text-[11px]">选择一名玩家进行守护，被守护者今晚不会被杀。</p>
          {guardLastTarget !== null && guardLastTarget !== undefined && (
            <p className="text-yellow-300/80 text-[10px] mt-1">⚠️ 不能连续两晚守同一人。</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 px-3 py-2 text-xs"
            onClick={() => onSubmitAction("guard")}
            disabled={target === null || submitDisabled}
          >
            🛡️ 守护
          </Button>
          <Button className="flex-1 px-3 py-2 text-xs !bg-gray-600 hover:!bg-gray-500" onClick={onSkipAction}>
            跳过
          </Button>
        </div>
      </div>
    );
  }

  // ── Default (Wolves, Seer, etc.) ──
  return (
    <div className="space-y-2">
      <div className="p-2.5 bg-purple-900/30 rounded-xl border border-purple-500/20">
        <p className="text-purple-200 text-xs font-semibold mb-1">🌙 夜晚行动</p>
        <p className="text-purple-100/70 text-[11px]">
          {target !== null ? "已选择目标，点击提交确认。" : "选择一名玩家作为目标。"}
        </p>
        {hint && <p className="text-purple-300/80 text-[10px] mt-1">{hint}</p>}
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 px-3 py-2 text-xs"
          onClick={() => onSubmitAction("target")}
          disabled={target === null || submitDisabled}
        >
          提交行动
        </Button>
        <Button className="flex-1 px-3 py-2 text-xs !bg-gray-600 hover:!bg-gray-500" onClick={onSkipAction}>
          跳过
        </Button>
      </div>
    </div>
  );
}
