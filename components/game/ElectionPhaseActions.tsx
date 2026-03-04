"use client";

import React from "react";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";
import { ElectionStateEnum } from "@/lib/enums";

interface ElectionPhaseActionsProps {
  electionState: string | null;
  submitted: boolean;
  candidates: number[];
  players: Array<{ name: string | null }>;
  currentPlayerId: number;
  target: number | null;
  chatMessages: Array<{ id: string; playerId: number; playerName: string; message: string }>;
  chatInput: string;
  onSignup: () => void;
  onOptOut: () => void;
  onWithdraw: () => void;
  onVote: () => void;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
}

export default function ElectionPhaseActions({
  electionState,
  submitted,
  candidates,
  players,
  currentPlayerId,
  target,
  chatMessages,
  chatInput,
  onSignup,
  onOptOut,
  onWithdraw,
  onVote,
  onChatInputChange,
  onSendChat,
}: ElectionPhaseActionsProps) {
  const isCandidate = candidates.includes(currentPlayerId);
  const getName = (idx: number) => players[idx]?.name || `P${idx + 1}`;

  // SIGNUP
  if (electionState === ElectionStateEnum.SIGNUP) {
    if (submitted) {
      return (
        <div className="space-y-2">
          <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
            <p className="text-amber-200 text-xs">
              {isCandidate ? "🙋 你已报名上警，等待其他人..." : "你已选择不上警，等待其他人..."}
            </p>
          </div>
          {candidates.length > 0 && (
            <p className="text-[10px] text-amber-300/70">
              当前候选人：{candidates.map(getName).join(", ")}
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
          <p className="text-amber-200 text-xs font-semibold mb-1">🌟 竞选警长 — 报名阶段</p>
          <p className="text-amber-100/75 text-[11px]">是否参与竞选警长？上警后将发表演说，票多者当选。</p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 px-3 py-2 text-xs !bg-amber-700 hover:!bg-amber-600" onClick={onSignup}>
            🙋 我要上警
          </Button>
          <Button className="flex-1 px-3 py-2 text-xs !bg-gray-600 hover:!bg-gray-500" onClick={onOptOut}>
            不上警
          </Button>
        </div>
        {candidates.length > 0 && (
          <p className="text-[10px] text-amber-300/70">已报名：{candidates.map(getName).join(", ")}</p>
        )}
      </div>
    );
  }

  // SPEAKING
  if (electionState === ElectionStateEnum.SPEAKING) {
    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
          <p className="text-amber-200 text-xs font-semibold mb-1">🌟 竞选警长 — 发言阶段</p>
          <p className="text-amber-100/75 text-[11px]">候选人：{candidates.map(getName).join(", ")}</p>
          {isCandidate && (
            <p className="text-yellow-300 text-[10px] mt-1">你是候选人，可发言或选择「退水」放弃竞选。</p>
          )}
        </div>

        {isCandidate && !submitted && (
          <Button className="w-full px-3 py-2 text-xs !bg-gray-600 hover:!bg-gray-500" onClick={onWithdraw}>
            💧 退水（放弃竞选）
          </Button>
        )}
        {submitted && isCandidate && (
          <p className="text-gray-400 text-[10px] text-center">你已退水，不再参与竞选。</p>
        )}

        {/* Chat for speeches */}
        <div className="bg-slate-800/50 rounded-xl p-2 h-28 overflow-y-auto space-y-1.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {chatMessages.length === 0 ? (
            <p className="text-white/30 text-[10px] text-center pt-2">等待候选人发言...</p>
          ) : (
            chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-1.5 rounded-lg ${msg.playerId === currentPlayerId ? "bg-blue-900/40 ml-3" : "bg-slate-700/40 mr-3"}`}
              >
                <p className="text-amber-300/90 text-[10px] font-semibold">{msg.playerName}</p>
                <p className="text-white/80 text-[11px]">{msg.message}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="发言..."
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSendChat(); } }}
            className="flex-1 text-white bg-slate-800/60 border-b border-b-amber-500/50 text-xs"
          />
          <Button className="px-3 py-1.5 text-[10px]" onClick={onSendChat}>发送</Button>
        </div>
      </div>
    );
  }

  // VOTING or PK
  if (electionState === ElectionStateEnum.VOTING || electionState === ElectionStateEnum.PK) {
    const isPK = electionState === ElectionStateEnum.PK;
    if (isCandidate) {
      return (
        <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
          <p className="text-amber-200 text-xs font-semibold mb-1">
            {isPK ? "🌟 警长竞选 — PK投票" : "🌟 警长竞选 — 投票阶段"}
          </p>
          <p className="text-amber-100/75 text-[11px]">你是候选人，无法投票。等待警下玩家投票...</p>
          <p className="text-amber-300/70 text-[10px] mt-1">候选人：{candidates.map(getName).join(", ")}</p>
        </div>
      );
    }

    if (submitted) {
      return (
        <div className="p-2.5 bg-green-900/30 rounded-xl border border-green-500/20">
          <p className="text-green-300 text-xs">✓ 已投票，等待其他玩家...</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
          <p className="text-amber-200 text-xs font-semibold mb-1">
            {isPK ? "🌟 警长竞选 — PK投票" : "🌟 警长竞选 — 投票阶段"}
          </p>
          <p className="text-amber-100/75 text-[11px]">
            选择一名候选人投票。{isPK && "上轮平票，进行PK决选。"}
          </p>
          <p className="text-amber-300/70 text-[10px] mt-1">候选人：{candidates.map(getName).join(", ")}</p>
        </div>
        <Button
          className="w-full px-3 py-2 text-xs"
          onClick={onVote}
          disabled={target === null || !candidates.includes(target)}
        >
          投票给 {target !== null ? getName(target) : "..."}
        </Button>
      </div>
    );
  }

  return null;
}
