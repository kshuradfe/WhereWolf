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

  let borderClass = "border-gray-600";
  if (isSpeaking) {
    borderClass = "border-green-400 shadow-green-400/50 shadow-lg";
  } else if (isCurrentSpeaker) {
    borderClass = "border-amber-400 shadow-amber-400/30 shadow-md";
  } else if (isSelected) {
    borderClass = "border-yellow-400 shadow-yellow-400 shadow-lg";
  } else if (!isAlive) {
    borderClass = "border-red-600";
  } else if (isMe) {
    borderClass = "border-blue-500";
  }

  const displayChar = showActualRole && actualCharacter ? actualCharacter : character;

  return (
    <div
      className={`relative bg-slate-800/60 rounded-lg p-3 border-2 transition-all ${borderClass} ${
        isSelectable ? "cursor-pointer hover:scale-105" : "cursor-default"
      } ${isSelected ? "scale-105" : ""}`}
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
      {/* Player Avatar */}
      <div className="relative w-full aspect-square mb-2 rounded overflow-hidden">
        <Image
          src={displayChar.avatar}
          alt={player.name || "Player"}
          width={200}
          height={200}
          className={`w-full h-full object-cover ${!isAlive ? "grayscale opacity-50" : ""}`}
        />
        {!isAlive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-red-400 text-2xl font-bold">💀</span>
          </div>
        )}
      </div>

      {/* Player Name */}
      <p className="text-orange-50 font-semibold text-center truncate">{player.name || `Player ${index + 1}`}</p>

      {/* Role Info (only if showing actual roles) */}
      {showActualRole && actualCharacter && (
        <p className="text-orange-300 text-xs text-center truncate">{actualCharacter.name}</p>
      )}

      {/* Tags */}
      {isSheriff && (
        <div className="absolute -top-2 -right-2 text-xl drop-shadow-lg" title="Sheriff">🌟</div>
      )}
      {isCandidate && !isSheriff && (
        <div className="absolute -top-1 -left-1 bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded font-bold">🙋</div>
      )}
      {isCurrentSpeaker && (
        <div className="absolute -bottom-2 -right-2 text-lg drop-shadow-lg animate-bounce" title="Speaking">🎤</div>
      )}
      {isSpeaking && !isCurrentSpeaker && (
        <div className="absolute -bottom-1 right-0 w-3 h-3 rounded-full bg-green-400 animate-pulse border border-green-300" title="Audio active" />
      )}
      {isMe && (
        <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-2 py-1 rounded font-bold">YOU</div>
      )}
      {player.isAdmin && !isSheriff && (
        <div className="absolute top-1 left-1 bg-yellow-500 text-black text-xs px-2 py-1 rounded font-bold">HOST</div>
      )}
      {!isAlive && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">
          DEAD
        </div>
      )}
    </div>
  );
}
