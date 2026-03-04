"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import AnimatedBackground from "@/components/game/AnimatedBackground";
import DayPhaseActions from "@/components/game/DayPhaseActions";
import VotingPhaseActions from "@/components/game/VotingPhaseActions";
import NightPhaseActions from "@/components/game/NightPhaseActions";
import GameStatistics from "@/components/game/GameStatistics";
import PlayerCard from "@/components/game/PlayerCard";
import GameHeader from "@/components/game/GameHeader";
import GameLog from "@/components/game/GameLog";
import { getApiService } from "@/services/apiService";
import { socketService } from "@/services/socketService";
import { GamePhaseEnum, ElectionStateEnum, LocalStorageKeyEnum, RouteEnum } from "@/lib/enums";
import type { ApiResponse, CharacterType, GameSessionType, PlayerType, RoomType } from "@/lib/types";
import { getBotNightAction, getBotVoteTarget, getBotGuardTarget, getBotHunterShootTarget, getBotElectionSignup, getBotElectionVote, isBotPlayer, randomDelay } from "@/lib/botLogic";
import ElectionPhaseActions from "@/components/game/ElectionPhaseActions";
import VoiceChat from "@/components/game/VoiceChat";

export default function GamePage() {
  const router = useRouter();

  // Core state
  const [room, setRoom] = useState<RoomType | null>(null);
  const [session, setSession] = useState<GameSessionType | null>(null);
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [me, setMe] = useState<number>(-1);
  const [role, setRole] = useState<CharacterType | null>(null);
  const [allCharacters, setAllCharacters] = useState<CharacterType[]>([]);
  const [phase, setPhase] = useState<GamePhaseEnum>(GamePhaseEnum.NIGHT);
  const [day, setDay] = useState<number>(1);
  const [winner, setWinner] = useState<string | null>(null);

  // UI state
  const [reveal, setReveal] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [logs, setLogs] = useState<{ id: string; text: string }[]>([]);
  const [chatMessages, setChatMessages] = useState<
    { id: string; playerId: number; playerName: string; message: string }[]
  >([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [wolfSelections, setWolfSelections] = useState<Record<number, number | null>>({});
  const [revealedTarget, setRevealedTarget] = useState<{ playerId: number; isWolf: boolean } | null>(null);
  const [botsActing, setBotsActing] = useState(false);
  const [speakingParticipants, setSpeakingParticipants] = useState<string[]>([]);
  const [prevElectionState, setPrevElectionState] = useState<string | null>(null);
  const isTestMode = typeof window !== "undefined" && localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true";

  // Refs for latest state inside callbacks/timeouts
  const sessionRef = useRef<GameSessionType | null>(null);
  const roomRef = useRef<RoomType | null>(null);
  const playersRef = useRef<PlayerType[]>([]);
  const allCharactersRef = useRef<CharacterType[]>([]);
  const botActingRef = useRef(false);
  const runBotEndTurnRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const runBotNightActionsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const runBotVotesRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const runBotHunterShootRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const runBotElectionActionsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const runBotPassBadgeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { allCharactersRef.current = allCharacters; }, [allCharacters]);

  // 竞选子阶段切换时重置提交状态，确保退水按钮可见
  useEffect(() => {
    if (session && session.electionState !== prevElectionState) {
      setSubmitted(false);
      setTarget(null);
      setPrevElectionState(session.electionState);
    }
  }, [session, prevElectionState]);

  // Derived
  const isAlive = useMemo(() => (session ? session.alivePlayers.includes(me) : true), [session, me]);
  const isWerewolf = role?.team === "werewolf";
  const isSeer = role ? (role.name.toLowerCase() === "seer" || role.name === "预言家") : false;
  const isWitch = role ? (role.name.toLowerCase() === "witch" || role.name === "女巫") : false;
  const isGuard = role ? (role.name.toLowerCase() === "guard" || role.name === "守卫") : false;
  const isHunter = role ? (role.name.toLowerCase() === "hunter" || role.name === "猎人") : false;

  const isSheriff = session?.sheriffId === me;
  const isCurrentSpeaker = session?.currentSpeakerId === me;
  const currentSpeakerName = session?.currentSpeakerId != null
    ? (players[session.currentSpeakerId]?.name || `Player ${session.currentSpeakerId + 1}`)
    : null;

  // Simultaneous night actions: any role with a night ability can act immediately
  const hasNightAction = isWerewolf || isSeer || isWitch || isGuard;
  const canAct = phase === GamePhaseEnum.NIGHT && isAlive && !submitted && hasNightAction;
  const canVote = phase === GamePhaseEnum.VOTING && isAlive && !submitted;
  const canBlowUp = isWerewolf && isAlive && (phase === GamePhaseEnum.DAY || phase === GamePhaseEnum.ELECTION);

  // Werewolf player indices
  const werewolves = useMemo(() => {
    if (!isWerewolf || !players.length || !allCharacters.length) return [];
    return players
      .map((p, idx) => ({ idx, role: allCharacters.find((c) => c.id === p.role) }))
      .filter((p) => p.role?.team === "werewolf")
      .map((p) => p.idx);
  }, [isWerewolf, players, allCharacters]);

  const wolfConsensus = useMemo(() => {
    if (!isWerewolf || werewolves.length === 0) return true;
    // Only require human wolves to agree; bots act independently via runBotNightActions
    const humanWolves = werewolves.filter((idx) => !isBotPlayer(players[idx]?.name ?? null));
    if (humanWolves.length === 0) return true;
    const selections = Object.entries(wolfSelections)
      .filter(([playerId]) => humanWolves.includes(Number(playerId)))
      .map(([, targetId]) => targetId);
    if (selections.length < humanWolves.length) return false;
    const firstTarget = selections[0];
    return selections.every((t) => t === firstTarget) && firstTarget !== null;
  }, [isWerewolf, werewolves, wolfSelections, players]);

  const phaseLabel = useMemo(() => {
    if (winner) return "Game Over";
    if (phase === GamePhaseEnum.NIGHT) return "Night Phase";
    if (phase === GamePhaseEnum.DAY) return "Day Phase";
    if (phase === GamePhaseEnum.VOTING) return "Voting Phase";
    if (phase === GamePhaseEnum.HUNTER_SHOOT) return "Hunter Shoot";
    if (phase === GamePhaseEnum.ELECTION) return "Sheriff Election";
    if (phase === GamePhaseEnum.PASS_BADGE) return "Badge Transfer";
    return "Game";
  }, [phase, winner]);

  // Wolf kill target from nightActions (for Witch heal — only visible if heal not yet used)
  const wolfTargetId = useMemo(() => {
    if (!session?.nightActions || session.witchHealUsed) return null;
    try {
      const actionsObj =
        typeof session.nightActions === "string"
          ? JSON.parse(session.nightActions)
          : session.nightActions;
      const actions = Object.values(actionsObj) as { action: string; target: number | null }[];
      const wolfKill = actions.find((a) => a.action === "wolf_kill");
      return wolfKill ? wolfKill.target : null;
    } catch {
      return null;
    }
  }, [session]);

  const addLog = useCallback((msg: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setLogs((prev) => [{ id, text: msg }, ...prev].slice(0, 50));
  }, []);

  const fetchState = useCallback(async (roomCode: string) => {
    try {
      const api = getApiService();
      const res: ApiResponse<{ room: RoomType; session: GameSessionType }> = await api.get(`/api/game/${roomCode}`);
      if (!res.success || !res.data) return;
      const { data } = res;
      setSession(data.session);
      setRoom(data.room);
      setPlayers(data.room.players);
      setPhase(data.session.phase);
      setDay(data.session.dayNumber);
      const storedId = parseInt(localStorage.getItem(LocalStorageKeyEnum.PLAYER_ID) || "-1", 10);
      setMe(storedId);
      const rolesRes: ApiResponse<CharacterType[]> = await api.get("/api/roles");
      if (rolesRes.success && rolesRes.data) {
        setAllCharacters(rolesRes.data);
        if (storedId >= 0) {
          const roleId = data.room.players[storedId]?.role;
          setRole(rolesRes.data.find((r) => r.id === roleId) || null);
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to fetch game state";
      toast.error(errorMessage);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const code = localStorage.getItem(LocalStorageKeyEnum.ROOM_CODE);
    if (code) {
      fetchState(code).then(() => {
        if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
          setTimeout(() => runBotNightActions(), 2000);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket events
  useEffect(() => {
    const roomCode = localStorage.getItem(LocalStorageKeyEnum.ROOM_CODE);

    socketService.onPhaseChanged((...args) => {
      const data = args[0] as { phase: GamePhaseEnum; dayNumber: number };
      setPhase(data.phase);
      setDay(data.dayNumber);
      setSubmitted(false);
      setTarget(null);
      setChatMessages([]);
      setWolfSelections({});
      setRevealedTarget(null);
      addLog(`Phase → ${data.phase} (Day ${data.dayNumber})`);
      if (roomCode) {
        fetchState(roomCode).then(() => {
          if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
            if (data.phase === GamePhaseEnum.NIGHT) {
              setTimeout(() => runBotNightActions(), 1200);
            } else if (data.phase === GamePhaseEnum.VOTING) {
              setTimeout(() => runBotVotes(), 1200);
            } else if (data.phase === GamePhaseEnum.HUNTER_SHOOT) {
              setTimeout(() => runBotHunterShoot(), 1200);
            } else if (data.phase === GamePhaseEnum.ELECTION) {
              setTimeout(() => runBotElectionActions(), 1200);
            } else if (data.phase === GamePhaseEnum.PASS_BADGE) {
              setTimeout(() => runBotPassBadge(), 1200);
            }
            // Auto-skip bot speakers during day/election speaking
            if (data.phase === GamePhaseEnum.DAY || data.phase === GamePhaseEnum.ELECTION) {
              setTimeout(() => runBotEndTurn(), 2000);
            }
          }
        });
      }
    });
    socketService.onPlayerEliminated((...args) => {
      const data = args[0] as { playerId: number };
      addLog(`Player ${data.playerId + 1} eliminated`);
      if (roomCode) fetchState(roomCode);
    });
    socketService.onGameEnded((...args) => {
      const data = args[0] as { winner: string };
      setWinner(data.winner);
      addLog(`Game Over: ${data.winner === "villager" ? "Villagers" : "Werewolves"} win`);
    });
    socketService.onActionSubmitted(() => {
      addLog(`A player submitted their night action`);
      // Re-fetch so witch can see the latest nightActions (wolf_kill target)
      if (roomCode) fetchState(roomCode);
    });
    socketService.onVoteSubmitted(() => {
      addLog(`A player has voted`);
    });
    socketService.onPlayerBlewUp((...args) => {
      const data = args[0] as { playerId: number };
      addLog(`Player ${data.playerId + 1} self-destructed!`);
      toast.error(`Player ${data.playerId + 1} self-destructed! 💥`, { autoClose: 3000 });
      if (roomCode) fetchState(roomCode);
    });
    socketService.onElectionUpdate(() => {
      if (roomCode) fetchState(roomCode);
    });
    socketService.onTurnChanged(() => {
      if (roomCode) {
        fetchState(roomCode).then(() => {
          if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
            setTimeout(() => runBotEndTurn(), 500);
          }
        });
      }
    });
    socketService.onWolfSelection((...args) => {
      const data = args[0] as { playerId: number; targetId: number | null };
      setWolfSelections((prev) => ({ ...prev, [data.playerId]: data.targetId }));
    });
    socketService.onChatMessage((...args) => {
      const data = args[0] as { playerId: number; playerName: string; message: string };
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setChatMessages((prev) => [...prev, { id, playerId: data.playerId, playerName: data.playerName, message: data.message }]);
    });
    return () => socketService.removeAllListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify other wolves when selecting a target
  useEffect(() => {
    if (isWerewolf && room && phase === GamePhaseEnum.NIGHT) {
      socketService.emitWolfSelect(room.roomCode, me, target);
      setWolfSelections((prev) => ({ ...prev, [me]: target }));
    }
  }, [target, isWerewolf, room, me, phase]);

  // ── Night Action Submit ──────────────────────────────────────
  const submitNightAction = async (actionType = "target") => {
    const isSkipLike = ["skip", "heal"].includes(actionType);
    if (!session || !room || (target === null && !isSkipLike)) {
      toast.warning("Select a target first");
      return;
    }
    if (isWerewolf && !wolfConsensus && actionType !== "skip") {
      toast.warning("All werewolves must select the same target");
      return;
    }
    try {
      const api = getApiService();
      const finalAction = isWerewolf ? "wolf_kill" : actionType;
      const finalTargetId = actionType === "heal" ? wolfTargetId : (actionType === "skip" ? null : target);

      const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", {
        sessionId: session.id,
        playerId: me,
        action: finalAction,
        targetId: finalTargetId,
      });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);

      // Seer: reveal team only (好人 or 狼人)
      if (isSeer && target !== null) {
        const targetRole = allCharacters.find((c) => c.id === players[target]?.role);
        if (targetRole) {
          const isWolfTarget = targetRole.team === "werewolf";
          setRevealedTarget({ playerId: target, isWolf: isWolfTarget });
          const name = players[target]?.name || `Player ${target + 1}`;
          toast.success(isWolfTarget ? `${name} 是狼人 🐺` : `${name} 是好人 🧑‍🌾`, { autoClose: 5000 });
        }
      }

      setTarget(null);
      socketService.emitActionSubmitted(room.roomCode, me);
      toast.success("Action submitted");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res.data?.allActionsComplete || (res as any).allActionsComplete) {
        const isAdmin = players[me]?.isAdmin;
        if (isAdmin) {
          setTimeout(() => advancePhase(), 2000);
        } else if (isTestMode) {
          setTimeout(async () => {
            try {
              const localApi = getApiService();
              const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
                await localApi.post("/api/game/phase", { sessionId: session.id });
              if (phaseRes.success && phaseRes.data && room) {
                applyPhaseTransition(room.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
              }
            } catch (err) { console.error("Phase advance after action failed", err); }
          }, 2000);
        } else {
          addLog("All night actions complete. Waiting for phase transition...");
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Submit failed";
      toast.error(errorMessage);
    }
  };

  const skipNightAction = async () => {
    if (!session || !room) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", {
        sessionId: session.id,
        playerId: me,
        action: "skip",
        targetId: null,
      });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);
      socketService.emitActionSubmitted(room.roomCode, me);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res.data?.allActionsComplete || (res as any).allActionsComplete) {
        const isAdmin = players[me]?.isAdmin;
        if (isAdmin) {
          setTimeout(() => advancePhase(), 2000);
        } else if (isTestMode) {
          setTimeout(async () => {
            try {
              const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
                await api.post("/api/game/phase", { sessionId: session.id });
              if (phaseRes.success && phaseRes.data) {
                applyPhaseTransition(room.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
              }
            } catch (err) { console.error("Phase advance after skip failed", err); }
          }, 2000);
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Skip failed";
      toast.error(errorMessage);
    }
  };

  // ── Hunter Shoot Submit ──────────────────────────────────────
  const submitHunterShoot = async (shootTarget: number | null) => {
    if (!session || !room) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
        await api.post("/api/game/phase", {
          sessionId: session.id,
          hunterTarget: shootTarget,
        });
      if (res.success && res.data) {
        applyPhaseTransition(room.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
      }
    } catch (e) {
      console.error("Hunter shoot failed", e);
    }
  };

  const submitVote = async () => {
    if (!session || !room || target === null) {
      toast.warning("Select a player to vote for");
      return;
    }
    try {
      const api = getApiService();
      const res: ApiResponse = await api.post("/api/game/vote", {
        sessionId: session.id,
        playerId: me,
        targetId: target,
      });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);
      setTarget(null);
      socketService.emitVoteSubmitted(room.roomCode, me);
      toast.success("Vote submitted");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Vote failed";
      toast.error(errorMessage);
    }
  };

  const sendChat = useCallback(() => {
    if (!room || !chatInput.trim()) return;
    const playerName = players[me]?.name || `Player ${me + 1}`;
    socketService.emitChatMessage(room.roomCode, me, chatInput, playerName);
    setChatInput("");
  }, [room, chatInput, players, me]);

  // ── Blow-Up (Self-Destruct) ─────────────────────────────────
  const blowUp = async () => {
    if (!session || !room || !canBlowUp) return;
    const confirmed = window.confirm("确定要自爆吗？你将立即死亡，游戏跳过白天直接进入黑夜！");
    if (!confirmed) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null; blowUpPlayerId: number }> =
        await api.post("/api/game/blow-up", { sessionId: session.id, playerId: me });
      if (res.success && res.data) {
        socketService.emitPlayerBlewUp(room.roomCode, me);
        toast.error("你自爆了！💥", { autoClose: 3000 });
        applyPhaseTransition(room.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Blow-up failed";
      toast.error(msg);
    }
  };

  // ── Election Actions ──────────────────────────────────────
  const submitElectionAction = async (action: string, targetId?: number) => {
    if (!session || !room) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ allSignedUp?: boolean; allVoted?: boolean; candidates?: number[] }> =
        await api.post("/api/game/election", {
          sessionId: session.id,
          playerId: me,
          action,
          targetId: targetId ?? null,
        });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);
      socketService.emitElectionUpdate(room.roomCode);
      fetchState(room.roomCode);

      // If all signed up or all voted, advance the election phase
      if (res.data?.allSignedUp || res.data?.allVoted) {
        setTimeout(async () => {
          try {
            const localApi = getApiService();
            const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
              await localApi.post("/api/game/phase", { sessionId: session.id });
            if (phaseRes.success && phaseRes.data) {
              applyPhaseTransition(room.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
            }
          } catch (err) { console.error("Election phase advance failed", err); }
        }, 1000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Election action failed";
      toast.error(msg);
    }
  };

  // ── Pass Badge ────────────────────────────────────────────
  const submitPassBadge = async (badgeTargetId: number | null) => {
    if (!session || !room) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
        await api.post("/api/game/phase", {
          sessionId: session.id,
          badgeTarget: badgeTargetId,
        });
      if (res.success && res.data) {
        applyPhaseTransition(room.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
      }
    } catch (e) {
      console.error("Pass badge failed", e);
    }
  };

  // Shared helper: apply a phase transition result to local state AND broadcast to others.
  // Needed because Socket.IO broadcast does NOT echo back to the sender, so the sender
  // must update its own UI manually after calling the phase API.
  const applyPhaseTransition = useCallback((
    roomCode: string,
    newPhase: string,
    newDay: number,
    newWinner: string | null
  ) => {
    socketService.emitPhaseChanged(roomCode, newPhase as GamePhaseEnum, newDay);
    setPhase(newPhase as GamePhaseEnum);
    setDay(newDay);
    setSubmitted(false);
    setTarget(null);
    setChatMessages([]);
    setWolfSelections({});
    setRevealedTarget(null);
    addLog(`Phase → ${newPhase} (Day ${newDay})`);
    fetchState(roomCode).then(() => {
      if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
        if (newPhase === GamePhaseEnum.NIGHT)         setTimeout(() => runBotNightActionsRef.current(), 1200);
        else if (newPhase === GamePhaseEnum.VOTING)   setTimeout(() => runBotVotesRef.current(), 1200);
        else if (newPhase === GamePhaseEnum.HUNTER_SHOOT) setTimeout(() => runBotHunterShootRef.current(), 1200);
        else if (newPhase === GamePhaseEnum.ELECTION) setTimeout(() => runBotElectionActionsRef.current(), 1200);
        else if (newPhase === GamePhaseEnum.PASS_BADGE) setTimeout(() => runBotPassBadgeRef.current(), 1200);

        if (newPhase === GamePhaseEnum.DAY || newPhase === GamePhaseEnum.ELECTION) {
          setTimeout(() => runBotEndTurnRef.current(), 2000);
        }
      }
    });
    if (newWinner) {
      setWinner(newWinner);
      socketService.emitGameEnded(roomCode, newWinner);
    }
  }, [fetchState, addLog]);

  const advancePhase = useCallback(async () => {
    if (!session || !room) return;
    const isAdmin = players[me]?.isAdmin;
    if (!isAdmin) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null; session: GameSessionType }> =
        await api.post("/api/game/phase", { sessionId: session.id });
      if (res.success && res.data) {
        applyPhaseTransition(room.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
      }
    } catch (e) {
      console.error("Phase transition failed", e);
    }
  }, [session, room, players, me, applyPhaseTransition]);

  // ── Bot Logic (Test Mode) ──────────────────────────────────
  const runBotNightActions = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    const chars = allCharactersRef.current;

    if (!s || !r) { botActingRef.current = false; return; }

    setBotsActing(true);
    addLog("[Test Mode] Bots are acting at night...");
    const api = getApiService();
    const botIndices = s.alivePlayers.filter((i) => isBotPlayer(p[i]?.name ?? null));

    // Separate by role type for ordering: wolves first, then seer/guard, then witch last
    const witchBots: number[] = [];
    const otherBots: number[] = [];
    for (const i of botIndices) {
      const c = chars.find((ch) => ch.id === p[i]?.role);
      if (c?.name.toLowerCase() === "witch" || c?.name === "女巫") witchBots.push(i);
      else otherBots.push(i);
    }

    let wolfVictimId: number | null = null;
    let allComplete = false;

    const handleBotActionResult = (res: ApiResponse<{ allActionsComplete?: boolean; roomCode?: string }>, botIdx: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (res.data?.allActionsComplete || (res as any).allActionsComplete) allComplete = true;
      socketService.emitActionSubmitted(r.roomCode, botIdx);
      // 立即刷新状态，确保女巫等角色能实时看到狼人刀人结果（Socket 可能未连接或不会回传发送方）
      fetchState(r.roomCode);
    };

    for (const botIdx of otherBots) {
      const botRole = chars.find((c) => c.id === p[botIdx]?.role);
      if (!botRole) continue;

      // Guard bot
      if (botRole.name.toLowerCase() === "guard" || botRole.name === "守卫") {
        const guardTarget = getBotGuardTarget(botIdx, s.alivePlayers, s.guardLastTarget);
        await randomDelay();
        try {
          const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action: "guard", targetId: guardTarget });
          handleBotActionResult(res, botIdx);
        } catch (e) { console.error(`Bot ${botIdx} guard failed`, e); }
        continue;
      }

      const { action, targetId } = getBotNightAction(botIdx, botRole, s.alivePlayers, p, chars);
      if (action === "wolf_kill" && targetId !== null) wolfVictimId = targetId;
      await randomDelay();
      try {
        const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action, targetId });
        handleBotActionResult(res, botIdx);
      } catch (e) { console.error(`Bot ${botIdx} night action failed`, e); }
    }

    // Witch bots last — with potion awareness
    for (const botIdx of witchBots) {
      const botRole = chars.find((c) => c.id === p[botIdx]?.role);
      if (!botRole) continue;
      const { action, targetId } = getBotNightAction(botIdx, botRole, s.alivePlayers, p, chars, wolfVictimId, s.witchHealUsed, s.witchPoisonUsed);
      await randomDelay();
      try {
        const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action, targetId });
        handleBotActionResult(res, botIdx);
      } catch (e) { console.error(`Bot ${botIdx} (witch) night action failed`, e); }
    }

    setBotsActing(false);

    if (allComplete) {
      addLog("[Test Mode] All night actions complete. Advancing phase...");
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
          await api.post("/api/game/phase", { sessionId: s.id });
        if (res.success && res.data) {
          applyPhaseTransition(r.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
        }
      } catch (e) { console.error("Bot advance phase failed", e); }
    } else {
      addLog("[Test Mode] Bots finished. Waiting for human players...");
    }

    botActingRef.current = false;
  }, [isTestMode, addLog, applyPhaseTransition, fetchState]);

  const runBotVotes = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    if (!s || !r) { botActingRef.current = false; return; }

    setBotsActing(true);
    addLog("[Test Mode] Bots are voting...");
    const api = getApiService();
    const botIndices = s.alivePlayers.filter((i) => isBotPlayer(p[i]?.name ?? null));

    for (const botIdx of botIndices) {
      const targetId = getBotVoteTarget(botIdx, s.alivePlayers);
      if (targetId === null) continue;
      await randomDelay();
      try {
        await api.post("/api/game/vote", { sessionId: s.id, playerId: botIdx, targetId });
        socketService.emitVoteSubmitted(r.roomCode, botIdx);
      } catch (e) { console.error(`Bot ${botIdx} vote failed`, e); }
    }

    setBotsActing(false);
    addLog("[Test Mode] Bots finished voting.");
    botActingRef.current = false;
  }, [isTestMode, addLog]);

  const runBotHunterShoot = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    const chars = allCharactersRef.current;
    if (!s || !r) { botActingRef.current = false; return; }

    // Find the dead hunter bot
    const deadPlayers = s.deadPlayers || [];
    let hunterBotIdx: number | null = null;
    for (const idx of deadPlayers) {
      if (!isBotPlayer(p[idx]?.name ?? null)) continue;
      const c = chars.find((ch) => ch.id === p[idx]?.role);
      if (c && (c.name.toLowerCase() === "hunter" || c.name === "猎人")) {
        hunterBotIdx = idx;
        break;
      }
    }

    if (hunterBotIdx !== null) {
      setBotsActing(true);
      addLog("[Test Mode] Bot hunter is shooting...");
      await randomDelay(500, 1200);
      const shootTarget = getBotHunterShootTarget(hunterBotIdx, s.alivePlayers);
      const api = getApiService();
      try {
        const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
          await api.post("/api/game/phase", { sessionId: s.id, hunterTarget: shootTarget });
        if (res.success && res.data) {
          applyPhaseTransition(r.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
        }
      } catch (e) { console.error("Bot hunter shoot failed", e); }
      setBotsActing(false);
    }

    botActingRef.current = false;
  }, [isTestMode, addLog, applyPhaseTransition]);

  const runBotElectionActions = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    if (!s || !r) { botActingRef.current = false; return; }

    setBotsActing(true);
    const api = getApiService();
    const botIndices = s.alivePlayers.filter((i) => isBotPlayer(p[i]?.name ?? null));

    if (s.electionState === "SIGNUP") {
      addLog("[Test Mode] Bots deciding on sheriff election signup...");
      let lastSignupRes: ApiResponse<{ allSignedUp?: boolean; allVoted?: boolean }> | null = null;
      for (const botIdx of botIndices) {
        const shouldSignup = getBotElectionSignup();
        await randomDelay();
        try {
          lastSignupRes = await api.post("/api/game/election", {
            sessionId: s.id, playerId: botIdx,
            action: shouldSignup ? "signup" : "opt_out",
          });
          socketService.emitElectionUpdate(r.roomCode);
        } catch (e) { console.error(`Bot ${botIdx} election signup failed`, e); }
      }
      // 最后一个机器人提交后，如果全员已报名，由 allSignedUp 标志触发阶段推进（只发一次）
      if (lastSignupRes?.data?.allSignedUp) {
        await randomDelay(300, 600);
        try {
          const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
            await api.post("/api/game/phase", { sessionId: s.id });
          if (phaseRes.success && phaseRes.data) {
            applyPhaseTransition(r.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
          }
        } catch (e) { console.error("Bot election signup phase advance failed", e); }
      }
    } else if (s.electionState === "SPEAKING") {
      // 发言阶段由顺麦（runBotEndTurn）驱动，结束后 end-turn 自动推进；此处只需等待
      addLog("[Test Mode] Bots speaking phase handled by speaker queue...");
    } else if (s.electionState === "VOTING" || s.electionState === "PK") {
      addLog("[Test Mode] Bots voting in sheriff election...");
      const candidates = s.sheriffCandidates;
      // VOTING：只有初始警下 bot 可投；PK：非 PK 候选人的 bot 可投
      const initialCands = s.initialCandidates ?? [];
      const voters = s.electionState === "PK"
        ? botIndices.filter((i) => !candidates.includes(i))
        : botIndices.filter((i) => !initialCands.includes(i));
      let lastVoteRes: ApiResponse<{ allSignedUp?: boolean; allVoted?: boolean }> | null = null;
      for (const botIdx of voters) {
        const voteTarget = getBotElectionVote(candidates);
        if (voteTarget === null) continue;
        await randomDelay();
        try {
          lastVoteRes = await api.post("/api/game/election", {
            sessionId: s.id, playerId: botIdx,
            action: "election_vote", targetId: voteTarget,
          });
          socketService.emitElectionUpdate(r.roomCode);
        } catch (e) { console.error(`Bot ${botIdx} election vote failed`, e); }
      }
      // 全员投票完成后，由 allVoted 标志触发一次阶段推进（只发一次）
      if (lastVoteRes?.data?.allVoted) {
        await randomDelay(300, 600);
        try {
          const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
            await api.post("/api/game/phase", { sessionId: s.id });
          if (phaseRes.success && phaseRes.data) {
            applyPhaseTransition(r.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
          }
        } catch (e) { console.error("Bot election vote phase advance failed", e); }
      }
    }

    setBotsActing(false);
    botActingRef.current = false;
  }, [isTestMode, addLog, applyPhaseTransition]);

  const runBotPassBadge = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    if (!s || !r) { botActingRef.current = false; return; }

    // Only act if the dead sheriff is a bot
    if (s.sheriffId === null || !isBotPlayer(p[s.sheriffId]?.name ?? null)) {
      botActingRef.current = false;
      return;
    }

    setBotsActing(true);
    addLog("[Test Mode] Bot sheriff transferring badge...");
    await randomDelay(500, 1200);

    // Bot randomly picks an alive player to transfer to (50%) or destroys (50%)
    const transferTarget = Math.random() > 0.5 && s.alivePlayers.length > 0
      ? s.alivePlayers[Math.floor(Math.random() * s.alivePlayers.length)]
      : null;

    const api = getApiService();
    try {
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
        await api.post("/api/game/phase", { sessionId: s.id, badgeTarget: transferTarget });
      if (res.success && res.data) {
        applyPhaseTransition(r.roomCode, res.data.phase, res.data.dayNumber, res.data.winner);
      }
    } catch (e) { console.error("Bot pass badge failed", e); }

    setBotsActing(false);
    botActingRef.current = false;
  }, [isTestMode, addLog, applyPhaseTransition]);

  // ── End Turn (pass mic to next speaker) ─────────────────
  const endSpeakerTurn = useCallback(async () => {
    if (!session || !room) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{
        currentSpeakerId: number | null;
        speakerQueue: number[];
        speakerStartTime: string | null;
        queueEmpty: boolean;
        nextAction?: string;
      }> = await api.post("/api/game/end-turn", {
        sessionId: session.id,
        playerId: session.currentSpeakerId,
      });

      if (res.success && res.data) {
        socketService.emitTurnChanged(room.roomCode, res.data.currentSpeakerId);
        fetchState(room.roomCode);

        if (res.data.queueEmpty) {
          if (res.data.nextAction === "advance_voting" || res.data.nextAction === "advance_election") {
            // 直接调用后端 API，绕过 advancePhase() 的房主权限拦截
            setTimeout(async () => {
              try {
                const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
                  await api.post("/api/game/phase", { sessionId: session.id });
                if (phaseRes.success && phaseRes.data) {
                  applyPhaseTransition(room.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
                }
              } catch (e) {
                console.error("Auto advance phase failed", e);
              }
            }, 500);
          }
        }
      }
    } catch (e) {
      console.error("End turn failed", e);
    }
  }, [session, room, fetchState, applyPhaseTransition]);

  const handleSpeakerTimerEnd = useCallback(() => {
    if (!session || !room) return;
    const isAdmin = players[me]?.isAdmin;
    if (isAdmin || isCurrentSpeaker) {
      endSpeakerTurn();
    }
  }, [session, room, players, me, isCurrentSpeaker, endSpeakerTurn]);

  // ── Bot auto-end-turn: 测试模式下 Bot 直接过麦，不等待发言时间 ──
  const runBotEndTurn = useCallback(async () => {
    if (!isTestMode) return;
    const s = sessionRef.current;
    const r = roomRef.current;
    const p = playersRef.current;
    if (!s || !r || s.currentSpeakerId === null) return;
    if (!isBotPlayer(p[s.currentSpeakerId]?.name ?? null)) return;

    await randomDelay(100, 300);
    // Re-check: state may have changed
    const latestSession = sessionRef.current;
    if (!latestSession || latestSession.currentSpeakerId === null) return;
    if (!isBotPlayer(p[latestSession.currentSpeakerId]?.name ?? null)) return;

    try {
      const api = getApiService();
      const res: ApiResponse<{
        currentSpeakerId: number | null;
        speakerQueue: number[];
        queueEmpty: boolean;
        nextAction?: string;
      }> = await api.post("/api/game/end-turn", {
        sessionId: latestSession.id,
        playerId: latestSession.currentSpeakerId,
      });

      if (res.success && res.data) {
        socketService.emitTurnChanged(r.roomCode, res.data.currentSpeakerId);
        await fetchState(r.roomCode);

        if (res.data.queueEmpty && res.data.nextAction) {
          // 直接调用后端 API，绕过 advancePhase() 的房主权限拦截
          setTimeout(async () => {
            try {
              const phaseRes: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
                await api.post("/api/game/phase", { sessionId: latestSession.id });
              if (phaseRes.success && phaseRes.data) {
                applyPhaseTransition(r.roomCode, phaseRes.data.phase, phaseRes.data.dayNumber, phaseRes.data.winner);
              }
            } catch (e) {
              console.error("Bot auto advance phase failed", e);
            }
          }, 500);
        } else if (res.data.currentSpeakerId !== null) {
          // Next speaker might also be a bot; chain the call
          setTimeout(() => runBotEndTurn(), 500);
        }
      }
    } catch (e) {
      console.error("Bot end-turn failed", e);
    }
  }, [isTestMode, fetchState, applyPhaseTransition]);

  useEffect(() => {
    runBotEndTurnRef.current = runBotEndTurn;
    runBotNightActionsRef.current = runBotNightActions;
    runBotVotesRef.current = runBotVotes;
    runBotHunterShootRef.current = runBotHunterShoot;
    runBotElectionActionsRef.current = runBotElectionActions;
    runBotPassBadgeRef.current = runBotPassBadge;
  }, [runBotEndTurn, runBotNightActions, runBotVotes, runBotHunterShoot, runBotElectionActions, runBotPassBadge]);

  const leaveGame = () => {
    if (room) socketService.leaveRoom(room.roomCode);
    localStorage.removeItem(LocalStorageKeyEnum.ROOM_CODE);
    localStorage.removeItem(LocalStorageKeyEnum.PLAYER_ID);
    localStorage.removeItem(LocalStorageKeyEnum.TEST_MODE);
    router.push(RouteEnum.HOME);
  };

  if (!room || !session || !role) {
    return (
      <AnimatedBackground phase={GamePhaseEnum.NIGHT} className="">
        <div className="flex items-center justify-center w-full h-screen">
          <p className="text-2xl text-orange-50">Loading game...</p>
        </div>
      </AnimatedBackground>
    );
  }

  const alive = (idx: number) => session.alivePlayers.includes(idx);
  const canElectionVote = phase === GamePhaseEnum.ELECTION &&
    (session.electionState === ElectionStateEnum.VOTING || session.electionState === ElectionStateEnum.PK) &&
    isAlive && !submitted &&
    (session.electionState === ElectionStateEnum.PK
      ? !session.sheriffCandidates.includes(me)
      : !session.initialCandidates.includes(me));
  const canPassBadge = phase === GamePhaseEnum.PASS_BADGE && isSheriff;
  const canSelect = phase === GamePhaseEnum.HUNTER_SHOOT
    ? (isHunter && !isAlive)
    : (canAct || canVote || canElectionVote || canPassBadge);
  const selectable = (idx: number) => canSelect && alive(idx) && idx !== me && !submitted;

  // Micro-3D button style constants
  const btnPrimary = "flex-1 px-4 py-3 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-[0_4px_0_rgb(67,56,202)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-y-0";
  const btnDanger  = "flex-1 px-4 py-3 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-red-500 to-red-700 shadow-[0_4px_0_rgb(153,27,27)] active:shadow-none active:translate-y-1 transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-y-0";
  const btnNeutral = "flex-1 px-4 py-3 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-slate-600 to-slate-700 shadow-[0_4px_0_rgb(30,41,59)] active:shadow-none active:translate-y-1 transition-all";
  const btnAmber   = "w-full px-4 py-2 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_4px_0_rgb(120,53,15)] active:shadow-none active:translate-y-1 transition-all";

  const renderPlayerCard = (p: PlayerType, idx: number) => {
    const showActualRole = !!(winner && room?.isShowRole);
    const actualCharacter = allCharacters.find((c) => c.id === p.role);
    const isWolf = werewolves.includes(idx);
    const wolfSelectedThis = wolfSelections[idx];
    const shouldRevealWolf = isWerewolf && isWolf && phase === GamePhaseEnum.NIGHT;

    const displayCharacter =
      showActualRole && actualCharacter
        ? actualCharacter
        : shouldRevealWolf && actualCharacter
          ? actualCharacter
          : {
              id: 0,
              name: p.name ?? "Waiting",
              avatar: "/images/characters/user.jpg",
              description: "Hidden",
              team: "villager" as const,
              priority: 0,
            };

    const playerKey = `${room.id}-player-${p.name || "empty"}-${p.role}-${idx}`;
    const selectedTarget =
      isWerewolf && isWolf && wolfSelectedThis !== undefined && wolfSelectedThis !== null
        ? players[wolfSelectedThis]?.name || `Player ${wolfSelectedThis + 1}`
        : null;

    const isGuardBlocked = isGuard && phase === GamePhaseEnum.NIGHT && session.guardLastTarget === idx;

    return (
      <div key={playerKey} className="relative">
        <PlayerCard
          player={p}
          index={idx}
          currentPlayerId={me}
          isAlive={alive(idx)}
          isSelectable={selectable(idx) && !isGuardBlocked}
          isSelected={target === idx}
          character={displayCharacter}
          actualCharacter={actualCharacter}
          showActualRole={showActualRole || shouldRevealWolf}
          onSelect={() => selectable(idx) && !isGuardBlocked && setTarget(idx)}
          isSheriff={session.sheriffId === idx}
          isCandidate={session.sheriffCandidates.includes(idx)}
          isSpeaking={speakingParticipants.includes(`player-${idx}`)}
          isCurrentSpeaker={session.currentSpeakerId === idx}
        />
        {selectedTarget && idx !== me && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap z-10">
            ➜ {selectedTarget}
          </div>
        )}
        {isGuardBlocked && (
          <div className="absolute top-0 right-0 bg-yellow-600 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10">
            已守
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatedBackground phase={phase} className="">
      <div className="w-full min-h-screen flex justify-center bg-black/40">
        <div className="w-full max-w-md h-[100dvh] flex flex-col relative overflow-hidden bg-slate-950/80">

          {/* Test Mode Banner */}
          {isTestMode && (
            <div className={`text-center text-xs px-4 py-1 font-semibold shrink-0 ${botsActing ? "bg-purple-700 text-white animate-pulse" : "bg-purple-900/70 text-purple-300"}`}>
              {botsActing ? "🤖 [Test Mode] Bots are acting..." : "🤖 Test Mode Active"}
            </div>
          )}

          {/* ── Middle Area: Left | Center | Right ── */}
          <div className="flex-1 flex flex-row overflow-hidden pb-24 px-1.5 pt-1">

            {/* Left Column — players 1–6 (indices 0–5) */}
            <div className="w-[72px] flex flex-col justify-between gap-1 py-1 shrink-0">
              {players.slice(0, 6).map((p, i) => renderPlayerCard(p, i))}
            </div>

            {/* Center Column — Header + Log + Actions */}
            <div className="flex-1 flex flex-col mx-1.5 min-w-0 overflow-hidden">
              <GameHeader
                phaseLabel={phaseLabel}
                day={day}
                isAlive={isAlive}
                timerLimit={
                  phase === GamePhaseEnum.ELECTION && session.electionState === "SIGNUP"
                    ? 10
                    : phase === GamePhaseEnum.VOTING ||
                      (phase === GamePhaseEnum.ELECTION &&
                        (session.electionState === "VOTING" || session.electionState === "PK"))
                      ? 15
                      : room.timerLimit
                }
                phase={phase}
                onTimerEnd={advancePhase}
                onLeaveGame={leaveGame}
                currentSpeakerId={session.currentSpeakerId}
                speakerStartTime={session.speakerStartTime}
                speakerName={currentSpeakerName}
                speakDuration={room.timerLimit}
                onSpeakerTimerEnd={handleSpeakerTimerEnd}
              />

              {/* Role chip */}
              <button
                onClick={() => setReveal(!reveal)}
                className="mt-1 mb-1 mx-auto flex items-center gap-1.5 px-3 py-1 bg-slate-800/70 border border-white/10 rounded-full text-[10px] text-white/70 hover:text-white/90 transition-colors shrink-0"
              >
                <span>{reveal ? "🙈" : "👁"}</span>
                <span className="truncate max-w-[80px]">{role.name}</span>
              </button>

              {/* Game Log — compact fixed height, scrollable */}
              <div className="h-28 shrink-0 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                <GameLog logs={logs} />
              </div>

              {/* Actions panel — fills remaining space, scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto mt-1.5 space-y-2 pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {(() => {
                  if (winner) {
                    return (
                      <GameStatistics
                        winner={winner}
                        day={day}
                        alivePlayers={session.alivePlayers}
                        deadPlayers={session.deadPlayers}
                        onLeaveGame={leaveGame}
                      />
                    );
                  }

                  // ── HUNTER SHOOT PHASE ──
                  if (phase === GamePhaseEnum.HUNTER_SHOOT) {
                    if (isHunter && !isAlive) {
                      return (
                        <div className="space-y-2">
                          <p className="text-orange-200/80 text-xs text-center">🔫 选择一名玩家带走，或放弃开枪</p>
                          <div className="flex gap-2">
                            <button className={btnDanger} onClick={() => submitHunterShoot(target)} disabled={target === null}>
                              🔫 开枪带走
                            </button>
                            <button className={btnNeutral} onClick={() => submitHunterShoot(null)}>
                              放弃开枪
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <p className="text-orange-200/70 text-xs text-center py-2">🔫 猎人正在选择开枪目标...</p>
                    );
                  }

                  if (!isAlive) {
                    return (
                      <p className="text-red-300/70 text-xs text-center py-2">💀 你已出局，静观其变</p>
                    );
                  }

                  // ── NIGHT PHASE ──
                  if (phase === GamePhaseEnum.NIGHT) {
                    if (canAct) {
                      const wolfHint =
                        isWerewolf && !wolfConsensus
                          ? "⚠️ 所有狼人须选同一目标"
                          : isWerewolf && wolfConsensus
                            ? "✓ 狼人已达成共识"
                            : undefined;

                      const wolfTargetName =
                        wolfTargetId !== null
                          ? players[wolfTargetId]?.name || `Player ${wolfTargetId + 1}`
                          : null;

                      return (
                        <NightPhaseActions
                          canAct={canAct}
                          submitted={submitted}
                          target={target}
                          onSubmitAction={submitNightAction}
                          onSkipAction={skipNightAction}
                          submitDisabled={isWerewolf && !wolfConsensus}
                          hint={wolfHint}
                          roleName={role?.name}
                          wolfTargetName={wolfTargetName}
                          witchHealUsed={session.witchHealUsed}
                          witchPoisonUsed={session.witchPoisonUsed}
                          guardLastTarget={session.guardLastTarget}
                        />
                      );
                    }
                    if (submitted && revealedTarget && isSeer) {
                      const targetName = players[revealedTarget.playerId]?.name || `Player ${revealedTarget.playerId + 1}`;
                      return (
                        <div className="space-y-1.5">
                          <p className="text-green-300 text-xs text-center">✓ 已提交，等待其他玩家...</p>
                          <div className="p-2.5 bg-blue-900/30 rounded-xl border border-blue-500/20">
                            <p className="text-blue-200 text-xs font-semibold mb-1">🔮 查验结果：</p>
                            <p className="text-blue-100 text-xs">
                              {targetName} 是{" "}
                              <span className={`font-bold ${revealedTarget.isWolf ? "text-red-400" : "text-green-400"}`}>
                                {revealedTarget.isWolf ? "狼人 🐺" : "好人 🧑‍🌾"}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    }
                    if (submitted) {
                      return <p className="text-green-300/80 text-xs text-center py-2">✓ 已提交，等待其他玩家...</p>;
                    }
                    return <p className="text-white/40 text-xs text-center py-2">🌙 等待夜晚行动...</p>;
                  }

                  // ── ELECTION PHASE ──
                  if (phase === GamePhaseEnum.ELECTION) {
                    return (
                      <div className="space-y-2">
                        {canBlowUp && (
                          <button
                            className="w-full px-4 py-3 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-red-500 to-red-700 shadow-[0_4px_0_rgb(153,27,27)] active:shadow-none active:translate-y-1 transition-all animate-pulse"
                            onClick={blowUp}
                          >
                            💥 立即自爆
                          </button>
                        )}
                        {session.electionState === "SPEAKING" && session.currentSpeakerId != null && (
                          <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
                            <p className="text-amber-200 text-xs font-semibold">
                              🎤 {currentSpeakerName} 正在警上发言
                              {session.speakerQueue.length > 0 && (
                                <span className="text-amber-100/60 font-normal ml-1.5">(剩余 {session.speakerQueue.length} 人)</span>
                              )}
                            </p>
                            {isCurrentSpeaker && (
                              <button className={`mt-2 ${btnAmber}`} onClick={endSpeakerTurn}>
                                结束发言 / 过麦 ⏭️
                              </button>
                            )}
                          </div>
                        )}
                        <ElectionPhaseActions
                          electionState={session.electionState}
                          submitted={submitted}
                          candidates={session.sheriffCandidates}
                          players={players}
                          currentPlayerId={me}
                          target={target}
                          chatMessages={chatMessages}
                          chatInput={chatInput}
                          onSignup={() => submitElectionAction("signup")}
                          onOptOut={() => submitElectionAction("opt_out")}
                          onWithdraw={() => submitElectionAction("withdraw")}
                          onVote={() => target !== null && submitElectionAction("election_vote", target)}
                          onChatInputChange={setChatInput}
                          onSendChat={sendChat}
                        />
                      </div>
                    );
                  }

                  // ── PASS BADGE PHASE ──
                  if (phase === GamePhaseEnum.PASS_BADGE) {
                    if (isSheriff) {
                      return (
                        <div className="space-y-2">
                          <p className="text-amber-200/80 text-xs text-center">🌟 你已死亡，请移交或撕毁警徽</p>
                          <div className="flex gap-2">
                            <button className={btnPrimary} onClick={() => submitPassBadge(target)} disabled={target === null}>
                              移交给 {target !== null ? (players[target]?.name || `P${target + 1}`) : "..."}
                            </button>
                            <button className={btnNeutral} onClick={() => submitPassBadge(null)}>
                              撕毁警徽
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return <p className="text-amber-200/70 text-xs text-center py-2">🌟 等待警长移交警徽...</p>;
                  }

                  // ── DAY PHASE ──
                  if (phase === GamePhaseEnum.DAY) {
                    return (
                      <div className="space-y-2">
                        {canBlowUp && (
                          <button
                            className="w-full px-4 py-3 text-sm font-bold rounded-xl text-white bg-gradient-to-b from-red-500 to-red-700 shadow-[0_4px_0_rgb(153,27,27)] active:shadow-none active:translate-y-1 transition-all animate-pulse"
                            onClick={blowUp}
                          >
                            💥 立即自爆
                          </button>
                        )}
                        {session.currentSpeakerId != null && (
                          <div className="p-2.5 bg-amber-900/30 rounded-xl border border-amber-500/20">
                            <p className="text-amber-200 text-xs font-semibold">
                              🎤 {currentSpeakerName} 正在发言
                              {session.speakerQueue.length > 0 && (
                                <span className="text-amber-100/60 font-normal ml-1.5">(剩余 {session.speakerQueue.length} 人)</span>
                              )}
                            </p>
                            {isCurrentSpeaker && (
                              <button className={`mt-2 ${btnAmber}`} onClick={endSpeakerTurn}>
                                结束发言 / 过麦 ⏭️
                              </button>
                            )}
                          </div>
                        )}
                        <DayPhaseActions
                          chatMessages={chatMessages}
                          chatInput={chatInput}
                          currentPlayerId={me}
                          onChatInputChange={setChatInput}
                          onSendChat={sendChat}
                        />
                      </div>
                    );
                  }

                  // ── VOTING PHASE ──
                  if (phase === GamePhaseEnum.VOTING) {
                    return (
                      <VotingPhaseActions
                        submitted={submitted}
                        target={target}
                        chatMessages={chatMessages}
                        chatInput={chatInput}
                        currentPlayerId={me}
                        onSubmitVote={submitVote}
                        onChatInputChange={setChatInput}
                        onSendChat={sendChat}
                      />
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Right Column — players 7–12 (indices 6–11) */}
            <div className="w-[72px] flex flex-col justify-between gap-1 py-1 shrink-0 items-end">
              {players.slice(6, 12).map((p, i) => renderPlayerCard(p, i + 6))}
            </div>
          </div>

          {/* ── Bottom Dock — FAB mic only ── */}
          <div className="absolute bottom-0 left-0 w-full z-20 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 rounded-t-2xl px-4 pt-3 pb-5">
            <div className="flex items-center justify-center gap-4">
              <VoiceChat
                sessionId={session.id}
                playerId={me}
                playerName={players[me]?.name || `Player ${me + 1}`}
                phase={phase}
                currentSpeakerId={session.currentSpeakerId}
                isCurrentSpeaker={isCurrentSpeaker}
                onEndTurn={endSpeakerTurn}
                onSpeakingChange={setSpeakingParticipants}
              />
              {session.currentSpeakerId != null && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-white/35">队列</span>
                  <span className="text-amber-300 font-bold">{session.speakerQueue.length}</span>
                  <span className="text-white/35">人</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </AnimatedBackground>
  );
}
