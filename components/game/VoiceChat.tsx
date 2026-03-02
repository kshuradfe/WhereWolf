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
    <div className="flex items-center gap-2">
      <RoomAudioRenderer />

      {canPublish && (
        <TrackToggle
          source={Track.Source.Microphone}
          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-green-700 hover:bg-green-600 text-white"
        />
      )}

      {canPublish && isSpeaking && (
        <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" title="Speaking" />
      )}

      {isCurrentSpeaker && (
        <button
          onClick={onEndTurn}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
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
      <div className="text-xs text-gray-500 italic">{error}</div>
    );
  }

  if (!tokenData?.token || !tokenData.room) {
    // No voice for this phase/role combo
    if (phase === "night") {
      return <div className="text-xs text-gray-500 italic">Night — voices silent</div>;
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
