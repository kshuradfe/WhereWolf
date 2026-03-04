"use client";

import { useEffect, useState } from "react";

interface SpeakerTimerProps {
  speakerStartTime: Date | string | null;
  speakDuration: number; // seconds per speaker
  onTimeEnd: () => void;
  className?: string;
  compact?: boolean;
}

export default function SpeakerTimer({
  speakerStartTime,
  speakDuration,
  onTimeEnd,
  className = "",
  compact = false,
}: SpeakerTimerProps) {
  const [timeLeft, setTimeLeft] = useState(speakDuration);

  useEffect(() => {
    if (!speakerStartTime) {
      setTimeLeft(speakDuration);
      return;
    }

    const startMs = new Date(speakerStartTime).getTime();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const remaining = Math.max(0, speakDuration - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        onTimeEnd();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [speakerStartTime, speakDuration, onTimeEnd]);

  const progress = (timeLeft / speakDuration) * 100;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const colorClass = progress > 50 ? "text-green-400" : progress > 25 ? "text-yellow-400" : "text-red-400";

  return (
    <div className={`relative ${className}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" stroke="currentColor" strokeWidth="8" fill="none" className="text-gray-700" />
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-1000`}
          style={{
            strokeDasharray: `${2 * Math.PI * 54}`,
            strokeDashoffset: `${2 * Math.PI * 54 * (1 - progress / 100)}`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold ${colorClass} ${compact ? "text-[10px] leading-none" : "text-2xl"}`}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
        {!compact && <span className="text-xs text-gray-400 mt-0.5">Speaker</span>}
      </div>
    </div>
  );
}
