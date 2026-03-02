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
import RolePanel from "@/components/game/RolePanel";
import GameLog from "@/components/game/GameLog";
import { getApiService } from "@/services/apiService";
import { socketService } from "@/services/socketService";
import { GamePhaseEnum, LocalStorageKeyEnum, RouteEnum } from "@/lib/enums";
import type { ApiResponse, CharacterType, GameSessionType, PlayerType, RoomType } from "@/lib/types";
import { getBotNightAction, getBotVoteTarget, getBotGuardTarget, getBotHunterShootTarget, isBotPlayer, randomDelay } from "@/lib/botLogic";

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
  const isTestMode = typeof window !== "undefined" && localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true";

  // Refs for latest state inside callbacks/timeouts
  const sessionRef = useRef<GameSessionType | null>(null);
  const roomRef = useRef<RoomType | null>(null);
  const playersRef = useRef<PlayerType[]>([]);
  const allCharactersRef = useRef<CharacterType[]>([]);
  const botActingRef = useRef(false);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { allCharactersRef.current = allCharacters; }, [allCharacters]);

  // Derived
  const isAlive = useMemo(() => (session ? session.alivePlayers.includes(me) : true), [session, me]);
  const isWerewolf = role?.team === "werewolf";
  const isSeer = role ? (role.name.toLowerCase() === "seer" || role.name === "预言家") : false;
  const isWitch = role ? (role.name.toLowerCase() === "witch" || role.name === "女巫") : false;
  const isGuard = role ? (role.name.toLowerCase() === "guard" || role.name === "守卫") : false;
  const isHunter = role ? (role.name.toLowerCase() === "hunter" || role.name === "猎人") : false;

  // Simultaneous night actions: any role with a night ability can act immediately
  const hasNightAction = isWerewolf || isSeer || isWitch || isGuard;
  const canAct = phase === GamePhaseEnum.NIGHT && isAlive && !submitted && hasNightAction;
  const canVote = phase === GamePhaseEnum.VOTING && isAlive && !submitted;

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
    const selections = Object.entries(wolfSelections)
      .filter(([playerId]) => werewolves.includes(Number(playerId)))
      .map(([, targetId]) => targetId);
    if (selections.length < werewolves.length) return false;
    const firstTarget = selections[0];
    return selections.every((t) => t === firstTarget) && firstTarget !== null;
  }, [isWerewolf, werewolves, wolfSelections]);

  const phaseLabel = useMemo(() => {
    if (winner) return "Game Over";
    if (phase === GamePhaseEnum.NIGHT) return "Night Phase";
    if (phase === GamePhaseEnum.DAY) return "Day Phase";
    if (phase === GamePhaseEnum.VOTING) return "Voting Phase";
    if (phase === GamePhaseEnum.HUNTER_SHOOT) return "Hunter Shoot";
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
    });
    socketService.onVoteSubmitted(() => {
      addLog(`A player has voted`);
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

      if (res.data?.allActionsComplete) {
        const isAdmin = players[me]?.isAdmin;
        if (isAdmin) {
          setTimeout(() => advancePhase(), 2000);
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
      const res: ApiResponse = await api.post("/api/game/action", {
        sessionId: session.id,
        playerId: me,
        action: "skip",
        targetId: null,
      });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);
      socketService.emitActionSubmitted(room.roomCode, me);
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
        socketService.emitPhaseChanged(room.roomCode, res.data.phase as GamePhaseEnum, res.data.dayNumber);
        if (res.data.winner) {
          setWinner(res.data.winner);
          socketService.emitGameEnded(room.roomCode, res.data.winner);
        }
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

  const advancePhase = useCallback(async () => {
    if (!session || !room) return;
    const isAdmin = players[me]?.isAdmin;
    if (!isAdmin) return;
    try {
      const api = getApiService();
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null; session: GameSessionType }> =
        await api.post("/api/game/phase", { sessionId: session.id });
      if (res.success && res.data) {
        socketService.emitPhaseChanged(room.roomCode, res.data.phase as GamePhaseEnum, res.data.dayNumber);
        if (res.data.winner) {
          setWinner(res.data.winner);
          socketService.emitGameEnded(room.roomCode, res.data.winner);
        }
      }
    } catch (e) {
      console.error("Phase transition failed", e);
    }
  }, [session, room, players, me]);

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

    for (const botIdx of otherBots) {
      const botRole = chars.find((c) => c.id === p[botIdx]?.role);
      if (!botRole) continue;

      // Guard bot
      if (botRole.name.toLowerCase() === "guard" || botRole.name === "守卫") {
        const guardTarget = getBotGuardTarget(botIdx, s.alivePlayers, s.guardLastTarget);
        await randomDelay();
        try {
          await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action: "guard", targetId: guardTarget });
          socketService.emitActionSubmitted(r.roomCode, botIdx);
        } catch (e) { console.error(`Bot ${botIdx} guard failed`, e); }
        continue;
      }

      const { action, targetId } = getBotNightAction(botIdx, botRole, s.alivePlayers, p, chars);
      if (action === "wolf_kill" && targetId !== null) wolfVictimId = targetId;
      await randomDelay();
      try {
        await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action, targetId });
        socketService.emitActionSubmitted(r.roomCode, botIdx);
      } catch (e) { console.error(`Bot ${botIdx} night action failed`, e); }
    }

    // Witch bots last — with potion awareness
    for (const botIdx of witchBots) {
      const botRole = chars.find((c) => c.id === p[botIdx]?.role);
      if (!botRole) continue;
      const { action, targetId } = getBotNightAction(botIdx, botRole, s.alivePlayers, p, chars, wolfVictimId, s.witchHealUsed, s.witchPoisonUsed);
      await randomDelay();
      try {
        await api.post("/api/game/action", { sessionId: s.id, playerId: botIdx, action, targetId });
        socketService.emitActionSubmitted(r.roomCode, botIdx);
      } catch (e) { console.error(`Bot ${botIdx} (witch) night action failed`, e); }
    }

    setBotsActing(false);
    addLog("[Test Mode] Bots finished night actions. Advancing phase...");
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
        await api.post("/api/game/phase", { sessionId: s.id });
      if (res.success && res.data) {
        socketService.emitPhaseChanged(r.roomCode, res.data.phase as GamePhaseEnum, res.data.dayNumber);
        if (res.data.winner) {
          setWinner(res.data.winner);
          socketService.emitGameEnded(r.roomCode, res.data.winner);
        }
      }
    } catch (e) { console.error("Bot advance phase failed", e); }

    botActingRef.current = false;
  }, [isTestMode, addLog]);

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
          socketService.emitPhaseChanged(r.roomCode, res.data.phase as GamePhaseEnum, res.data.dayNumber);
          if (res.data.winner) {
            setWinner(res.data.winner);
            socketService.emitGameEnded(r.roomCode, res.data.winner);
          }
        }
      } catch (e) { console.error("Bot hunter shoot failed", e); }
      setBotsActing(false);
    }

    botActingRef.current = false;
  }, [isTestMode, addLog]);

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
  const canSelect = phase === GamePhaseEnum.HUNTER_SHOOT ? (isHunter && !isAlive) : (canAct || canVote);
  const selectable = (idx: number) => canSelect && alive(idx) && idx !== me && !submitted;

  return (
    <AnimatedBackground phase={phase} className="">
      <div className="w-full h-screen flex flex-col overflow-hidden">
        {isTestMode && (
          <div className={`text-center text-xs px-4 py-1 font-semibold ${botsActing ? "bg-purple-700 text-white animate-pulse" : "bg-purple-900/70 text-purple-300"}`}>
            {botsActing ? "🤖 [Test Mode] Bots are acting..." : "🤖 Test Mode Active"}
          </div>
        )}
        <GameHeader
          phaseLabel={phaseLabel}
          day={day}
          isAlive={isAlive}
          timerLimit={room.timerLimit}
          phase={phase}
          onTimerEnd={advancePhase}
          onLeaveGame={leaveGame}
        />
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          <RolePanel role={role} isRevealed={reveal} onToggleReveal={() => setReveal(!reveal)} />
          <div className="flex-1 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-orange-500/30 p-6 overflow-y-auto">
            <h2 className="text-2xl font-bold text-orange-50 mb-4">
              {winner && room?.isShowRole ? "Final Roles Revealed" : "Players"}
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {players.map((p, idx) => {
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

                // Guard: visually mark the last guarded player as not selectable
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
                    />
                    {selectedTarget && idx !== me && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                        → {selectedTarget}
                      </div>
                    )}
                    {isGuardBlocked && (
                      <div className="absolute top-1 right-1 bg-yellow-600 text-white text-xs px-2 py-0.5 rounded font-bold">
                        昨晚已守
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="w-80 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-orange-500/30 p-6 space-y-4 overflow-y-auto">
            <h2 className="text-2xl font-bold text-orange-50 mb-4">Actions</h2>
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
                    <div className="space-y-3">
                      <div className="p-4 bg-orange-900/30 rounded-lg border border-orange-500/30">
                        <h3 className="text-orange-200 font-semibold mb-2">🔫 猎人开枪</h3>
                        <p className="text-orange-100/80 text-sm">
                          你已死亡！选择一名玩家带走，或放弃开枪。
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 px-4 py-3 text-sm rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold disabled:opacity-50"
                          onClick={() => submitHunterShoot(target)}
                          disabled={target === null}
                        >
                          开枪带走
                        </button>
                        <button
                          className="flex-1 px-4 py-3 text-sm rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold"
                          onClick={() => submitHunterShoot(null)}
                        >
                          放弃开枪
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="p-4 bg-orange-900/30 rounded-lg border border-orange-500/30">
                    <p className="text-orange-200 text-sm">🔫 猎人正在选择开枪目标...</p>
                  </div>
                );
              }

              if (!isAlive) {
                return (
                  <div className="p-4 bg-red-900/30 rounded-lg border border-red-500/30">
                    <p className="text-red-200 text-sm">You have been eliminated. Watch as the game continues.</p>
                  </div>
                );
              }

              // ── NIGHT PHASE ──
              if (phase === GamePhaseEnum.NIGHT) {
                if (canAct) {
                  const wolfHint =
                    isWerewolf && !wolfConsensus
                      ? "⚠️ All werewolves must select the same target to proceed"
                      : isWerewolf && wolfConsensus
                        ? "✓ All werewolves agree on the target"
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
                // Seer submitted: show vision result
                if (submitted && revealedTarget && isSeer) {
                  const targetName = players[revealedTarget.playerId]?.name || `Player ${revealedTarget.playerId + 1}`;
                  return (
                    <div className="space-y-3">
                      <div className="p-4 bg-green-900/30 rounded-lg border border-green-500/30">
                        <p className="text-green-200 text-sm">✓ Action submitted. Waiting for other players...</p>
                      </div>
                      <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
                        <p className="text-blue-200 text-sm font-semibold mb-2">🔮 查验结果：</p>
                        <p className="text-blue-100 text-sm">
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
                  return (
                    <div className="p-4 bg-green-900/30 rounded-lg border border-green-500/30">
                      <p className="text-green-200 text-sm">✓ Action submitted. Waiting for other players...</p>
                    </div>
                  );
                }
                return <p className="text-orange-100/80 text-sm">Waiting for night actions...</p>;
              }

              // ── DAY PHASE ──
              if (phase === GamePhaseEnum.DAY) {
                return (
                  <DayPhaseActions
                    chatMessages={chatMessages}
                    chatInput={chatInput}
                    currentPlayerId={me}
                    onChatInputChange={setChatInput}
                    onSendChat={sendChat}
                  />
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
            <GameLog logs={logs} />
          </div>
        </div>
      </div>
    </AnimatedBackground>
  );
}
