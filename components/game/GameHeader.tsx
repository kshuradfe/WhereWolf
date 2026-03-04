"use client";

import React from "react";
import Timer from "@/components/shared/Timer";
import SpeakerTimer from "@/components/game/SpeakerTimer";
import { GamePhaseEnum } from "@/lib/enums";

interface GameHeaderProps {
  phaseLabel: string;
  day: number;
  isAlive: boolean;
  timerLimit: number;
  phase: GamePhaseEnum;
  onTimerEnd: () => void;
  onLeaveGame: () => void;
  currentSpeakerId?: number | null;
  speakerStartTime?: Date | string | null;
  speakerName?: string | null;
  speakDuration?: number;
  onSpeakerTimerEnd?: () => void;
}

export default function GameHeader({
  phaseLabel,
  day,
  isAlive,
  timerLimit,
  phase,
  onTimerEnd,
  onLeaveGame,
  currentSpeakerId,
  speakerStartTime,
  speakerName,
  speakDuration = 30,
  onSpeakerTimerEnd,
}: GameHeaderProps) {
  const hasSpeaker = currentSpeakerId !== null && currentSpeakerId !== undefined;
  const showSpeakerTimer = hasSpeaker && (phase === GamePhaseEnum.DAY || phase === GamePhaseEnum.ELECTION);

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/10 p-2.5 mb-1 shrink-0">
      {/* Top row: phase + day + leave */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="text-sm font-bold text-white/90 truncate leading-tight">{phaseLabel}</h1>
          <span className="text-xs text-white/50 shrink-0">· D{day}</span>
          {!isAlive && (
            <span className="px-1.5 py-px bg-red-600/70 rounded-full text-white text-[9px] font-semibold shrink-0">
              出局
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Timer */}
          {showSpeakerTimer && onSpeakerTimerEnd ? (
            <SpeakerTimer
              speakerStartTime={speakerStartTime ?? null}
              speakDuration={speakDuration}
              onTimeEnd={onSpeakerTimerEnd}
              className="w-9 h-9"
              compact
            />
          ) : phase !== GamePhaseEnum.NIGHT ? (
            <Timer
              initialTime={timerLimit}
              key={`${phase}-${day}`}
              onTimeEnd={onTimerEnd}
              className="w-9 h-9"
              compact
            />
          ) : null}

          {/* Leave game — compact danger icon button */}
          <button
            type="button"
            onClick={onLeaveGame}
            title="Leave Game"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-base bg-gradient-to-b from-red-500 to-red-700 shadow-[0_3px_0_rgb(153,27,27)] active:shadow-none active:translate-y-0.5 transition-all"
          >
            🚪
          </button>
        </div>
      </div>

      {/* Speaker chip */}
      {hasSpeaker && speakerName && (
        <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-amber-900/40 border border-amber-500/20 rounded-full w-fit max-w-full">
          <span className="text-amber-300 text-xs">🎤</span>
          <span className="text-amber-100/90 text-[11px] font-semibold truncate">{speakerName}</span>
        </div>
      )}
    </div>
  );
}
