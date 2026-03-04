"use client";

import React, { useEffect, useRef } from "react";

interface GameLogProps {
  logs: Array<{ id: string; text: string }>;
}

export default function GameLog({ logs }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 pt-2 pb-1 shrink-0">
        📜 Log
      </p>
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1 min-h-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {logs.length === 0 ? (
          <p className="text-white/20 text-[10px] text-center pt-4">游戏事件将显示在此处...</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="text-white/60 text-[10px] py-0.5 border-b border-white/5 leading-snug"
            >
              {log.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
