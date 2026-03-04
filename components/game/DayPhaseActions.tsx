"use client";

import React from "react";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";

interface DayPhaseActionsProps {
  chatMessages: Array<{
    id: string;
    playerId: number;
    playerName: string;
    message: string;
  }>;
  chatInput: string;
  currentPlayerId: number;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
}

export default function DayPhaseActions({
  chatMessages,
  chatInput,
  currentPlayerId,
  onChatInputChange,
  onSendChat,
}: DayPhaseActionsProps) {
  return (
    <div className="space-y-2">
      <div className="p-2.5 bg-blue-900/30 rounded-xl border border-blue-500/20">
        <p className="text-blue-200 text-xs font-semibold mb-0.5">☀️ 白天讨论</p>
        <p className="text-blue-100/65 text-[11px]">分享信息，交流怀疑。</p>
      </div>

      {/* Chat Messages */}
      <div className="bg-slate-800/50 rounded-xl p-2 h-36 overflow-y-auto space-y-1.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {chatMessages.length === 0 ? (
          <p className="text-white/25 text-[10px] text-center pt-4">暂无消息，开始讨论吧！</p>
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

      {/* Chat Input */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="发言..."
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendChat(); }
          }}
          className="flex-1 text-white bg-slate-800/60 border-b border-b-blue-500/50 text-xs"
        />
        <Button className="px-3 py-1.5 text-[10px]" onClick={onSendChat}>发送</Button>
      </div>
    </div>
  );
}
