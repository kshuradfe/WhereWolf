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
  const getName = (idx: number) => players[idx]?.name || `Player ${idx + 1}`;

  // SIGNUP
  if (electionState === ElectionStateEnum.SIGNUP) {
    if (submitted) {
      return (
        <div className="space-y-3">
          <div className="p-4 bg-amber-900/30 rounded-lg border border-amber-500/30">
            <p className="text-amber-200 text-sm">
              {isCandidate ? "🙋 你已报名上警，等待其他人..." : "你已选择不上警，等待其他人..."}
            </p>
          </div>
          {candidates.length > 0 && (
            <div className="text-xs text-amber-300/80">
              当前候选人：{candidates.map(getName).join(", ")}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="p-4 bg-amber-900/30 rounded-lg border border-amber-500/30">
          <h3 className="text-amber-200 font-semibold mb-2">🌟 竞选警长 — 报名阶段</h3>
          <p className="text-amber-100/80 text-sm">
            是否参与竞选警长？上警后将发表竞选演说，获得最多票数者当选。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-amber-700 hover:!bg-amber-600"
            onClick={onSignup}
          >
            🙋 我要上警
          </Button>
          <Button
            className="flex-1 px-4 py-3 text-sm !bg-gray-600 hover:!bg-gray-500"
            onClick={onOptOut}
          >
            不上警
          </Button>
        </div>
        {candidates.length > 0 && (
          <div className="text-xs text-amber-300/80">
            已报名：{candidates.map(getName).join(", ")}
          </div>
        )}
      </div>
    );
  }

  // SPEAKING
  if (electionState === ElectionStateEnum.SPEAKING) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-amber-900/30 rounded-lg border border-amber-500/30">
          <h3 className="text-amber-200 font-semibold mb-2">🌟 竞选警长 — 发言阶段</h3>
          <p className="text-amber-100/80 text-sm">
            候选人：{candidates.map(getName).join(", ")}
          </p>
          {isCandidate && (
            <p className="text-yellow-300 text-xs mt-2">你是候选人。你可以发言或选择「退水」放弃竞选。</p>
          )}
        </div>

        {isCandidate && !submitted && (
          <Button
            className="w-full px-4 py-3 text-sm !bg-gray-600 hover:!bg-gray-500"
            onClick={onWithdraw}
          >
            💧 退水（放弃竞选）
          </Button>
        )}
        {submitted && isCandidate && (
          <div className="p-3 bg-gray-900/30 rounded-lg border border-gray-500/30">
            <p className="text-gray-300 text-sm">你已退水，不再参与竞选。</p>
          </div>
        )}

        {/* Chat for speeches */}
        <div className="bg-slate-800/60 rounded-lg p-3 h-40 overflow-y-auto space-y-2">
          {chatMessages.length === 0 ? (
            <p className="text-gray-400 text-sm text-center">等待候选人发言...</p>
          ) : (
            chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2 rounded ${msg.playerId === currentPlayerId ? "bg-blue-900/40 ml-4" : "bg-slate-700/40 mr-4"}`}
              >
                <p className="text-orange-300 text-xs font-semibold">{msg.playerName}</p>
                <p className="text-orange-50 text-sm">{msg.message}</p>
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
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onSendChat(); }
            }}
            className="flex-1 text-white bg-slate-800/60 border-b-2 border-b-orange-500 text-sm"
          />
          <Button className="px-4 py-2 text-xs" onClick={onSendChat}>Send</Button>
        </div>
      </div>
    );
  }

  // VOTING or PK
  if (electionState === ElectionStateEnum.VOTING || electionState === ElectionStateEnum.PK) {
    const isPK = electionState === ElectionStateEnum.PK;
    if (isCandidate) {
      return (
        <div className="space-y-3">
          <div className="p-4 bg-amber-900/30 rounded-lg border border-amber-500/30">
            <h3 className="text-amber-200 font-semibold mb-2">
              {isPK ? "🌟 警长竞选 — PK投票" : "🌟 警长竞选 — 投票阶段"}
            </h3>
            <p className="text-amber-100/80 text-sm">
              你是候选人，无法投票。等待警下玩家投票...
            </p>
            <p className="text-amber-300 text-xs mt-1">
              候选人：{candidates.map(getName).join(", ")}
            </p>
          </div>
        </div>
      );
    }

    if (submitted) {
      return (
        <div className="p-4 bg-green-900/30 rounded-lg border border-green-500/30">
          <p className="text-green-200 text-sm">✓ 已投票，等待其他玩家...</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="p-4 bg-amber-900/30 rounded-lg border border-amber-500/30">
          <h3 className="text-amber-200 font-semibold mb-2">
            {isPK ? "🌟 警长竞选 — PK投票" : "🌟 警长竞选 — 投票阶段"}
          </h3>
          <p className="text-amber-100/80 text-sm">
            选择一名候选人投票。{isPK && "上轮平票，进行PK决选。"}
          </p>
          <p className="text-amber-300 text-xs mt-1">
            候选人：{candidates.map(getName).join(", ")}
          </p>
        </div>
        <Button
          className="w-full px-4 py-3 text-sm"
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
