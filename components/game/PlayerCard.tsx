"use client";

import React from "react";
import Image from "next/image";
import { CharacterType, PlayerType } from "@/lib/types";

interface PlayerCardProps {
  player: PlayerType;
  index: number;
  currentPlayerId: number;
  isAlive: boolean;
  isSelectable: boolean;
  isSelected: boolean;
  character: CharacterType;
  actualCharacter?: CharacterType;
  showActualRole: boolean;
  onSelect: () => void;
  isSheriff?: boolean;
  isCandidate?: boolean;
  isSpeaking?: boolean;
  isCurrentSpeaker?: boolean;
}

export default function PlayerCard({
  player,
  index,
  currentPlayerId,
  isAlive,
  isSelectable,
  isSelected,
  character,
  actualCharacter,
  showActualRole,
  onSelect,
  isSheriff = false,
  isCandidate = false,
  isSpeaking = false,
  isCurrentSpeaker = false,
}: PlayerCardProps) {
  const isMe = index === currentPlayerId;
  const displayChar = showActualRole && actualCharacter ? actualCharacter : character;

  let avatarBorder = "border-white/10";
  let avatarRing = "";
  if (isSpeaking) {
    avatarBorder = "border-green-400";
    avatarRing = "ring-2 ring-green-400 ring-offset-1 ring-offset-slate-900 animate-pulse";
  } else if (isCurrentSpeaker) {
    avatarBorder = "border-amber-400";
    avatarRing = "ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900";
  } else if (!isAlive) {
    avatarBorder = "border-red-800/60";
  } else if (isMe) {
    avatarBorder = "border-blue-500";
  }

  return (
    <div
      className={`relative flex flex-col items-center rounded-xl transition-all duration-150
        ${isSelectable ? "cursor-pointer active:scale-95" : "cursor-default"}
        ${isSelected ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-slate-900 -translate-y-0.5 scale-105" : ""}
      `}
      onClick={isSelectable ? onSelect : undefined}
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isSelectable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Avatar */}
      <div className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 ${avatarBorder} ${avatarRing}`}>
        <Image
          src={displayChar.avatar}
          alt={player.name || "Player"}
          width={120}
          height={120}
          className={`w-full h-full object-cover ${!isAlive ? "grayscale opacity-50" : ""}`}
        />

        {/* Dead overlay */}
        {!isAlive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-xl">💀</span>
          </div>
        )}

        {/* Sheriff badge — top-right of avatar */}
        {isSheriff && (
          <span className="absolute top-0.5 right-0.5 text-xs drop-shadow-lg leading-none">🌟</span>
        )}

        {/* Candidate badge */}
        {isCandidate && !isSheriff && (
          <span className="absolute top-0.5 right-0.5 text-xs drop-shadow-lg leading-none">🙋</span>
        )}

        {/* YOU badge */}
        {isMe && (
          <span className="absolute bottom-0.5 left-0.5 bg-blue-500/80 text-white text-[7px] px-1 py-px rounded font-bold leading-tight">
            YOU
          </span>
        )}

        {/* HOST badge */}
        {player.isAdmin && !isMe && (
          <span className="absolute bottom-0.5 left-0.5 bg-yellow-500/80 text-black text-[7px] px-1 py-px rounded font-bold leading-tight">
            HOST
          </span>
        )}

        {/* Current speaker mic */}
        {isCurrentSpeaker && (
          <span className="absolute bottom-0.5 right-0.5 text-xs drop-shadow-lg animate-bounce leading-none">🎤</span>
        )}
      </div>

      {/* Player number + name */}
      <p className="text-white/75 text-[10px] truncate w-full text-center mt-0.5 px-0.5 leading-tight">
        <span className="text-white/35">{index + 1}.</span>
        {player.name || `P${index + 1}`}
      </p>

      {/* Role name (only when revealed) */}
      {showActualRole && actualCharacter && (
        <p className="text-indigo-300/80 text-[9px] truncate w-full text-center px-0.5 leading-tight">
          {actualCharacter.name}
        </p>
      )}
    </div>
  );
}
