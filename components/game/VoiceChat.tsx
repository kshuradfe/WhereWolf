"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useIsSpeaking,
  TrackToggle,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { getApiService } from "@/services/apiService";
import type { ApiResponse } from "@/lib/types";

interface VoiceChatProps {
  sessionId: number;
  playerId: number;
  playerName: string;
  phase: string;
  currentSpeakerId: number | null;
  isCurrentSpeaker: boolean;
  onEndTurn: () => void;
  onSpeakingChange?: (participantIds: string[]) => void;
}

interface TokenData {
  token: string | null;
  room: string | null;
  canPublish: boolean;
}

function VoiceChatInner({
  isCurrentSpeaker,
  onEndTurn,
  onSpeakingChange,
}: {
  isCurrentSpeaker: boolean;
  onEndTurn: () => void;
  onSpeakingChange?: (participantIds: string[]) => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const isSpeaking = useIsSpeaking(localParticipant);

  useEffect(() => {
    if (!onSpeakingChange) return;
    const speakingIds = participants
      .filter((p) => p.isSpeaking)
      .map((p) => p.identity);
    onSpeakingChange(speakingIds);
  }, [participants, onSpeakingChange]);

  const canPublish = localParticipant.permissions?.canPublish ?? false;

  return (
    <div className="flex items-center gap-3">
      <RoomAudioRenderer />

      {/* FAB Microphone button */}
      {canPublish && (
        <div className="relative">
          <TrackToggle
            source={Track.Source.Microphone}
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white bg-gradient-to-b from-green-500 to-green-700 shadow-[0_4px_0_rgb(20,83,45)] active:shadow-none active:translate-y-1 transition-all border border-green-400/30"
          />
          {/* Speaking ping indicator */}
          {isSpeaking && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-slate-900 animate-ping" />
          )}
        </div>
      )}

      {/* No publish permission — silent indicator */}
      {!canPublish && (
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-800/60 border border-white/10">
          <span className="text-white/30 text-lg">🔇</span>
        </div>
      )}

      {/* Pass mic — micro-3D amber button */}
      {isCurrentSpeaker && (
        <button
          onClick={onEndTurn}
          className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_4px_0_rgb(120,53,15)] active:shadow-none active:translate-y-1 transition-all"
        >
          过麦 ⏭️
        </button>
      )}
    </div>
  );
}

export default function VoiceChat({
  sessionId,
  playerId,
  playerName,
  phase,
  currentSpeakerId,
  isCurrentSpeaker,
  onEndTurn,
  onSpeakingChange,
}: VoiceChatProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const fetchToken = useCallback(async () => {
    try {
      const api = getApiService();
      const res: ApiResponse<TokenData> = await api.post("/api/livekit/token", {
        sessionId,
        playerId,
        playerName,
      });
      if (res.success && res.data) {
        setTokenData(res.data);
        setError(null);
      } else {
        setTokenData(null);
      }
    } catch (e) {
      console.error("Failed to fetch LiveKit token:", e);
      setError("Voice chat unavailable");
      setTokenData(null);
    }
  }, [sessionId, playerId, playerName]);

  // Refetch token on phase change or speaker change
  useEffect(() => {
    fetchToken();
  }, [fetchToken, phase, currentSpeakerId]);

  if (!livekitUrl) {
    return null;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-800/60 border border-white/10">
          <span className="text-red-400/60 text-lg">🔇</span>
        </div>
        <span className="text-[10px] text-red-400/60 italic">{error}</span>
      </div>
    );
  }

  if (!tokenData?.token || !tokenData.room) {
    if (phase === "night") {
      return (
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-800/40 border border-white/5">
            <span className="text-white/20 text-lg">🔇</span>
          </div>
          <span className="text-[10px] text-white/30 italic">夜晚静默</span>
        </div>
      );
    }
    return null;
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={tokenData.token}
      connect={true}
      audio={true}
      video={false}
    >
      <VoiceChatInner
        isCurrentSpeaker={isCurrentSpeaker}
        onEndTurn={onEndTurn}
        onSpeakingChange={onSpeakingChange}
      />
    </LiveKitRoom>
  );
}
