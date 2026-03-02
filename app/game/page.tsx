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
import { getBotNightAction, getBotVoteTarget, isBotPlayer, randomDelay } from "@/lib/botLogic";

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
  const [nightActionsSubmitted, setNightActionsSubmitted] = useState<Set<number>>(new Set());
  const [revealedTarget, setRevealedTarget] = useState<{ playerId: number; role: CharacterType } | null>(null);
  const [botsActing, setBotsActing] = useState(false);
  const isTestMode = typeof window !== "undefined" && localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true";

  // Refs to always access the latest state inside callbacks/timeouts (avoids stale closures)
  const sessionRef = useRef<GameSessionType | null>(null);
  const roomRef = useRef<RoomType | null>(null);
  const playersRef = useRef<PlayerType[]>([]);
  const allCharactersRef = useRef<CharacterType[]>([]);

  const advancePhaseRef = useRef<() => Promise<void>>(async () => {});
  // Mutex: prevents runBotNightActions / runBotVotes from running concurrently
  const botActingRef = useRef(false);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { allCharactersRef.current = allCharacters; }, [allCharacters]);

  // Derived
  const isAlive = useMemo(() => (session ? session.alivePlayers.includes(me) : true), [session, me]);
  const isWerewolf = role?.team === "werewolf";

  // Check if higher priority roles have acted (priority system: higher number = acts first)
  const canActBasedOnPriority = useMemo(() => {
    if (!role || !session || !players.length || !allCharacters.length) return false;
    const myPriority = role.priority;
    if (myPriority === 0) return false; // No night action

    // Get all alive players with higher priority than me
    const higherPriorityPlayers = session.alivePlayers
      .filter((pIdx) => pIdx !== me)
      .map((pIdx) => {
        const playerRole = allCharacters.find((c) => c.id === players[pIdx]?.role);
        return { idx: pIdx, priority: playerRole?.priority || 0 };
      })
      .filter((p) => p.priority > myPriority);

    // All higher priority players must have acted
    return higherPriorityPlayers.every((p) => nightActionsSubmitted.has(p.idx));
  }, [role, session, players, allCharacters, me, nightActionsSubmitted]);

  const canAct =
    phase === GamePhaseEnum.NIGHT && isAlive && !submitted && (role?.priority ?? 0) > 0 && canActBasedOnPriority;
  const canVote = phase === GamePhaseEnum.VOTING && isAlive && !submitted;

  // Get all werewolf player indices
  const werewolves = useMemo(() => {
    if (!isWerewolf || !players.length || !allCharacters.length) return [];
    return players
      .map((p, idx) => ({ idx, role: allCharacters.find((c) => c.id === p.role) }))
      .filter((p) => p.role?.team === "werewolf")
      .map((p) => p.idx);
  }, [isWerewolf, players, allCharacters]);

  // Check if all wolves have selected the same target
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
    return "Game";
  }, [phase, winner]);

  // Extract the wolf kill target from nightActions (needed for Witch's heal decision)
  const wolfTargetId = useMemo(() => {
    if (!session?.nightActions) return null;
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
      // Fetch all characters for role reveal
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

  useEffect(() => {
    const code = localStorage.getItem(LocalStorageKeyEnum.ROOM_CODE);
    if (code) {
      fetchState(code).then(() => {
        if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
          // First night: give state time to settle then run bot actions
          setTimeout(() => runBotNightActions(), 2000);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setNightActionsSubmitted(new Set());
      setRevealedTarget(null);
      addLog(`Phase → ${data.phase} (Day ${data.dayNumber})`);
      if (roomCode) {
        fetchState(roomCode).then(() => {
          if (localStorage.getItem(LocalStorageKeyEnum.TEST_MODE) === "true") {
            if (data.phase === GamePhaseEnum.NIGHT) {
              setTimeout(() => runBotNightActions(), 1200);
            } else if (data.phase === GamePhaseEnum.VOTING) {
              setTimeout(() => runBotVotes(), 1200);
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
    socketService.onActionSubmitted((...args) => {
      const data = args[0] as { playerId: number };
      // Track that this player has acted (for priority system)
      setNightActionsSubmitted((prev) => new Set(prev).add(data.playerId));
      // Don't reveal player identity in logs
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
      setChatMessages((prev) => [
        ...prev,
        {
          id,
          playerId: data.playerId,
          playerName: data.playerName,
          message: data.message,
        },
      ]);
    });
    return () => socketService.removeAllListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify other wolves when this wolf selects a target
  useEffect(() => {
    if (isWerewolf && room && phase === GamePhaseEnum.NIGHT) {
      socketService.emitWolfSelect(room.roomCode, me, target);
      setWolfSelections((prev) => ({ ...prev, [me]: target }));
    }
  }, [target, isWerewolf, room, me, phase]);

  const submitNightAction = async (actionType = "target") => {
    const isSkipLike = ["skip", "heal"].includes(actionType);
    if (!session || !room || (target === null && !isSkipLike)) {
      toast.warning("Select a target first");
      return;
    }
    // Wolves must have consensus
    if (isWerewolf && !wolfConsensus && actionType !== "skip") {
      toast.warning("All werewolves must select the same target");
      return;
    }
    try {
      const api = getApiService();
      // Wolves tag their kill so the backend can distinguish it from other "target" actions
      const finalAction = isWerewolf ? "wolf_kill" : actionType;
      // Heal always targets the wolf's victim; poison uses the selected target
      const finalTargetId = actionType === "heal" ? wolfTargetId : (actionType === "skip" ? null : target);

      const res: ApiResponse<{ allActionsComplete?: boolean }> = await api.post("/api/game/action", {
        sessionId: session.id,
        playerId: me,
        action: finalAction,
        targetId: finalTargetId,
      });
      if (!res.success) throw new Error(res.message || "Failed");
      setSubmitted(true);
      
      // If Seer, reveal the target's role
      if (role?.name.toLowerCase().includes('seer') && target !== null) {
        const targetRole = allCharacters.find((c) => c.id === players[target]?.role);
        if (targetRole) {
          setRevealedTarget({ playerId: target, role: targetRole });
          toast.success(`${players[target]?.name || `Player ${target + 1}`} is a ${targetRole.name}!`, {
            autoClose: 5000,
          });
        }
      }
      
      setTarget(null);
      socketService.emitActionSubmitted(room.roomCode, me);
      toast.success("Action submitted");

      // Auto-transition to day if all night actions are complete
      if (res.data?.allActionsComplete) {
        const isAdmin = players[me]?.isAdmin;
        if (isAdmin) {
          // Admin auto-advances the phase after a short delay
          setTimeout(() => {
            advancePhase();
          }, 2000);
        } else {
          // Non-admins will receive the phase change via socket event from admin
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
        await api.post("/api/game/phase", {
          sessionId: session.id,
        });
      if (res.success && res.data) {
        socketService.emitPhaseChanged(room.roomCode, res.data.phase as GamePhaseEnum, day);
        if (res.data.winner) {
          setWinner(res.data.winner);
          socketService.emitGameEnded(room.roomCode, res.data.winner);
        }
      }
    } catch (e) {
      console.error("Phase transition failed", e);
    }
  }, [session, room, players, me, day]);

  // Keep advancePhaseRef in sync so bot callbacks always call the latest version
  useEffect(() => { advancePhaseRef.current = advancePhase; }, [advancePhase]);

  const runBotNightActions = useCallback(async () => {
    if (!isTestMode) return;
    // Mutex: prevent concurrent executions (e.g. React StrictMode double-invoke)
    if (botActingRef.current) return;
    botActingRef.current = true;

    // Read latest state via refs to avoid stale closure
    const currentSession = sessionRef.current;
    const currentRoom = roomRef.current;
    const currentPlayers = playersRef.current;
    const currentCharacters = allCharactersRef.current;

    if (!currentSession || !currentRoom) {
      botActingRef.current = false;
      return;
    }

    setBotsActing(true);
    addLog("[Test Mode] Bots are acting at night...");
    const api = getApiService();

    const botIndices = currentSession.alivePlayers.filter((i) => isBotPlayer(currentPlayers[i]?.name ?? null));

    // Witch acts last — needs to know who the wolf killed first
    const witchBotIndices = botIndices.filter((i) => {
      const r = currentCharacters.find((c) => c.id === currentPlayers[i]?.role);
      return r?.name.toLowerCase() === "witch" || r?.name === "女巫";
    });
    const nonWitchBotIndices = botIndices.filter((i) => !witchBotIndices.includes(i));

    let wolfVictimId: number | null = null;

    for (const botIdx of nonWitchBotIndices) {
      const botRoleId = currentPlayers[botIdx]?.role;
      const botRole = currentCharacters.find((c) => c.id === botRoleId);
      if (!botRole) continue;

      const { action, targetId } = getBotNightAction(botIdx, botRole, currentSession.alivePlayers, currentPlayers, currentCharacters);
      if (action === "wolf_kill" && targetId !== null) wolfVictimId = targetId;
      await randomDelay();
      try {
        await api.post("/api/game/action", {
          sessionId: currentSession.id,
          playerId: botIdx,
          action,
          targetId,
        });
        socketService.emitActionSubmitted(currentRoom.roomCode, botIdx);
        setNightActionsSubmitted((prev) => new Set(prev).add(botIdx));
      } catch (e) {
        console.error(`Bot ${botIdx} night action failed`, e);
      }
    }

    for (const botIdx of witchBotIndices) {
      const botRoleId = currentPlayers[botIdx]?.role;
      const botRole = currentCharacters.find((c) => c.id === botRoleId);
      if (!botRole) continue;

      const { action, targetId } = getBotNightAction(botIdx, botRole, currentSession.alivePlayers, currentPlayers, currentCharacters, wolfVictimId);
      await randomDelay();
      try {
        await api.post("/api/game/action", {
          sessionId: currentSession.id,
          playerId: botIdx,
          action,
          targetId,
        });
        socketService.emitActionSubmitted(currentRoom.roomCode, botIdx);
        setNightActionsSubmitted((prev) => new Set(prev).add(botIdx));
      } catch (e) {
        console.error(`Bot ${botIdx} (witch) night action failed`, e);
      }
    }

    setBotsActing(false);
    addLog("[Test Mode] Bots finished night actions. Advancing phase...");

    // Call the phase API directly — avoids isAdmin check in advancePhase which can fail
    await new Promise((r) => setTimeout(r, 800));
    try {
      const res: ApiResponse<{ phase: string; dayNumber: number; winner: string | null }> =
        await api.post("/api/game/phase", { sessionId: currentSession.id });
      if (res.success && res.data) {
        socketService.emitPhaseChanged(currentRoom.roomCode, res.data.phase as GamePhaseEnum, res.data.dayNumber);
        if (res.data.winner) {
          setWinner(res.data.winner);
          socketService.emitGameEnded(currentRoom.roomCode, res.data.winner);
        }
      }
    } catch (e) {
      console.error("Bot advance phase (night→day) failed", e);
    }

    botActingRef.current = false;
  }, [isTestMode, addLog]);

  const runBotVotes = useCallback(async () => {
    if (!isTestMode) return;
    if (botActingRef.current) return;
    botActingRef.current = true;

    const currentSession = sessionRef.current;
    const currentRoom = roomRef.current;
    const currentPlayers = playersRef.current;

    if (!currentSession || !currentRoom) {
      botActingRef.current = false;
      return;
    }

    setBotsActing(true);
    addLog("[Test Mode] Bots are voting...");
    const api = getApiService();

    const botIndices = currentSession.alivePlayers.filter((i) => isBotPlayer(currentPlayers[i]?.name ?? null));

    for (const botIdx of botIndices) {
      const targetId = getBotVoteTarget(botIdx, currentSession.alivePlayers);
      if (targetId === null) continue;
      await randomDelay();
      try {
        await api.post("/api/game/vote", {
          sessionId: currentSession.id,
          playerId: botIdx,
          targetId,
        });
        socketService.emitVoteSubmitted(currentRoom.roomCode, botIdx);
      } catch (e) {
        console.error(`Bot ${botIdx} vote failed`, e);
      }
    }

    setBotsActing(false);
    addLog("[Test Mode] Bots finished voting.");
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
  const selectable = (idx: number) => (canAct || canVote) && alive(idx) && idx !== me && !submitted;

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

                // Wolves can see each other's roles during night phase
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

                // Show which target this wolf selected
                const selectedTarget =
                  isWerewolf && isWolf && wolfSelectedThis !== undefined && wolfSelectedThis !== null
                    ? players[wolfSelectedThis]?.name || `Player ${wolfSelectedThis + 1}`
                    : null;

                return (
                  <div key={playerKey} className="relative">
                    <PlayerCard
                      player={p}
                      index={idx}
                      currentPlayerId={me}
                      isAlive={alive(idx)}
                      isSelectable={selectable(idx)}
                      isSelected={target === idx}
                      character={displayCharacter}
                      actualCharacter={actualCharacter}
                      showActualRole={showActualRole || shouldRevealWolf}
                      onSelect={() => selectable(idx) && setTarget(idx)}
                    />
                    {selectedTarget && idx !== me && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                        → {selectedTarget}
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
              if (!isAlive) {
                return (
                  <div className="p-4 bg-red-900/30 rounded-lg border border-red-500/30">
                    <p className="text-red-200 text-sm">You have been eliminated. Watch as the game continues.</p>
                  </div>
                );
              }
              if (phase === GamePhaseEnum.NIGHT) {
                if ((role?.priority ?? 0) > 0 && !submitted) {
                  if (!canActBasedOnPriority) {
                    return (
                      <div className="p-4 bg-purple-900/30 rounded-lg border border-purple-500/30">
                        <p className="text-purple-200 text-sm">⏳ Waiting for higher priority roles to act first...</p>
                        <p className="text-purple-300 text-xs mt-2">
                          Your role acts after other roles complete their actions.
                        </p>
                      </div>
                    );
                  }

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
                      />
                    );
                  }
                }
                if (submitted && revealedTarget && role?.name.toLowerCase().includes('seer')) {
                  return (
                    <div className="space-y-3">
                      <div className="p-4 bg-green-900/30 rounded-lg border border-green-500/30">
                        <p className="text-green-200 text-sm">✓ Action submitted. Waiting for other players...</p>
                      </div>
                      <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
                        <p className="text-blue-200 text-sm font-semibold mb-2">🔮 Vision Revealed:</p>
                        <p className="text-blue-100 text-sm">
                          {players[revealedTarget.playerId]?.name || `Player ${revealedTarget.playerId + 1}`} is a{' '}
                          <span className="font-bold text-blue-300">{revealedTarget.role.name}</span>
                        </p>
                        <p className="text-blue-300 text-xs mt-2">Team: {revealedTarget.role.team}</p>
                      </div>
                    </div>
                  );
                }
                return <p className="text-orange-100/80 text-sm">Waiting for night actions...</p>;
              }
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
