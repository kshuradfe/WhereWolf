"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useIsSpeaking,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { getApiService } from "@/services/apiService";
import type { ApiResponse } from "@/lib/types";

interface VoiceChatProps {
  sessionId: number;
  playerId: number;
  playerName: string;
  phase: string;
  currentSpeakerId: number | null;
  onSpeakingChange?: (participantIds: string[]) => void;
}

interface TokenData {
  token: string | null;
  room: string | null;
  canPublish: boolean;
}

/** Reusable disabled FAB when outside a LiveKit room */
function DisabledFAB({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl bg-slate-800/40 border border-white/8 opacity-50">
        🎤
      </div>
      <span className="text-[10px] text-white/25 tracking-wide">{label}</span>
    </div>
  );
}

function VoiceChatInner({
  onSpeakingChange,
}: {
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
  const micEnabled = localParticipant.isMicrophoneEnabled;

  const toggleMic = useCallback(() => {
    if (!canPublish) return;
    localParticipant.setMicrophoneEnabled(!micEnabled);
  }, [localParticipant, micEnabled, canPublish]);

  const isActive = canPublish && micEnabled;
  const showRipple = isActive && isSpeaking;

  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <RoomAudioRenderer />

      {/* Ripple rings — only when mic is open and audio is detected */}
      {showRipple && (
        <>
          <span className="absolute inset-0 rounded-full bg-green-400/25 animate-ping" />
          <span
            className="absolute inset-0 rounded-full bg-green-400/15 animate-ping"
            style={{ animationDuration: "1.6s", animationDelay: "0.4s" }}
          />
        </>
      )}

      {/* Always show the 🎤 FAB — style changes based on state */}
      <button
        onClick={toggleMic}
        disabled={!canPublish}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all
          ${isActive
            ? "bg-gradient-to-b from-green-400 to-green-600 shadow-[0_6px_0_rgb(20,83,45)] active:shadow-none active:translate-y-1.5 border border-green-300/30"
            : canPublish
              ? "bg-gradient-to-b from-slate-600 to-slate-800 shadow-[0_6px_0_rgb(15,23,42)] active:shadow-none active:translate-y-1.5 border border-white/10"
              : "bg-slate-800/40 border border-white/8 opacity-40 cursor-not-allowed"
          }`}
      >
        🎤
      </button>

      <span className={`text-[10px] font-semibold tracking-wide
        ${isActive ? "text-green-400" : canPublish ? "text-white/50" : "text-white/20"}`}
      >
        {isActive ? "发言中..." : canPublish ? "点击发言" : "等待..."}
      </span>
    </div>
  );
}

export default function VoiceChat({
  sessionId,
  playerId,
  playerName,
  phase,
  currentSpeakerId,
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
      setError("语音不可用");
      setTokenData(null);
    }
  }, [sessionId, playerId, playerName]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken, phase, currentSpeakerId]);

  if (!livekitUrl) return <DisabledFAB label="语音未配置" />;
  if (error) return <DisabledFAB label="语音不可用" />;
  if (!tokenData?.token || !tokenData.room) {
    return <DisabledFAB label={phase === "night" ? "夜晚" : "连接中..."} />;
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={tokenData.token}
      connect={true}
      audio={true}
      video={false}
    >
      <VoiceChatInner onSpeakingChange={onSpeakingChange} />
    </LiveKitRoom>
  );
}
