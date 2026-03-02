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
    <header className="bg-slate-900/80 backdrop-blur-sm border-b border-orange-500/30 p-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-orange-50">{phaseLabel}</h1>
          <span className="text-xl text-orange-200">Day {day}</span>
          {!isAlive && (
            <span className="px-3 py-1 bg-red-600/80 rounded-full text-white font-semibold">Eliminated</span>
          )}
          {hasSpeaker && speakerName && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-800/60 rounded-full border border-amber-500/40">
              <span className="text-amber-200 text-sm">🎤</span>
              <span className="text-amber-100 text-sm font-semibold">{speakerName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {showSpeakerTimer && onSpeakerTimerEnd ? (
            <SpeakerTimer
              speakerStartTime={speakerStartTime ?? null}
              speakDuration={speakDuration}
              onTimeEnd={onSpeakerTimerEnd}
              className="w-20 h-20"
            />
          ) : phase !== GamePhaseEnum.NIGHT ? (
            <Timer initialTime={timerLimit} key={`${phase}-${day}`} onTimeEnd={onTimerEnd} className="w-24 h-24" />
          ) : null}
          <button
            type="button"
            onClick={onLeaveGame}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Leave Game
          </button>
        </div>
      </div>
    </header>
  );
}
