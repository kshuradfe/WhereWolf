"use client";

import React from "react";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";

interface VotingPhaseActionsProps {
  submitted: boolean;
  target: number | null;
  chatMessages: Array<{
    id: string;
    playerId: number;
    playerName: string;
    message: string;
  }>;
  chatInput: string;
  currentPlayerId: number;
  onSubmitVote: () => void;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
}

export default function VotingPhaseActions({
  submitted,
  target,
  chatMessages,
  chatInput,
  currentPlayerId,
  onSubmitVote,
  onChatInputChange,
  onSendChat,
}: VotingPhaseActionsProps) {
  if (submitted) {
    return (
      <div className="space-y-2">
        <div className="p-2.5 bg-green-900/30 rounded-xl border border-green-500/20">
          <p className="text-green-300 text-xs">✓ 已投票，等待其他玩家...</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-2 h-28 overflow-y-auto space-y-1.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-1.5 rounded-lg ${msg.playerId === currentPlayerId ? "bg-blue-900/40 ml-3" : "bg-slate-700/40 mr-3"}`}
            >
              <p className="text-amber-300/90 text-[10px] font-semibold">{msg.playerName}</p>
              <p className="text-white/80 text-[11px]">{msg.message}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="p-2.5 bg-red-900/30 rounded-xl border border-red-500/20">
        <p className="text-red-200 text-xs font-semibold mb-1">🗳️ 投票阶段</p>
        <p className="text-red-100/75 text-[11px]">
          {target !== null
            ? `投票淘汰 玩家 ${target + 1}，点击提交确认。`
            : "选择一名玩家投票淘汰。"}
        </p>
      </div>

      <Button className="w-full px-3 py-2 text-xs" onClick={onSubmitVote} disabled={target === null}>
        提交投票
      </Button>

      <div className="bg-slate-800/50 rounded-xl p-2 h-20 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {chatMessages.slice(-5).map((msg) => (
          <div key={msg.id} className="text-[10px]">
            <span className="text-amber-300/80 font-semibold">{msg.playerName}:</span>
            <span className="text-white/70 ml-1">{msg.message}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="快速发言..."
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSendChat(); }
          }}
          className="flex-1 text-white bg-slate-800/60 border-b border-b-red-500/50 text-xs"
        />
        <Button className="px-3 py-1.5 text-[10px]" onClick={onSendChat}>发送</Button>
      </div>
    </div>
  );
}
