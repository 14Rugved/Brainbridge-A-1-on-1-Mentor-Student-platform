"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { backendApi } from "@/lib/api";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { supabase } from "@/lib/supabase";
import { MessageItem, SessionItem } from "@/types/domain";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Participant {
  id: string;
  role: string;
  email: string | null;
  isTyping?: boolean;
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [token, setToken] = useState("");
  const [session, setSession] = useState<SessionItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("# Start coding...\n");
  const [language, setLanguage] = useState("python");
  const [stdin, setStdin] = useState("");
  const [runOut, setRunOut] = useState("");
  const [runErr, setRunErr] = useState("");
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [showOutput, setShowOutput] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ensurePeer = useCallback((socketToken: string) => {
    if (peerRef.current) return peerRef.current;
    
    const socket = getSocket(socketToken);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket.connected) {
        socket.emit("webrtc:signal", { sessionId, type: "candidate", candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteVideo.current) remoteVideo.current.srcObject = stream;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        stopCall();
      }
    };

    peerRef.current = pc;
    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const attachLocalTracks = (pc: RTCPeerConnection, stream: MediaStream) => {
    const senderTrackIds = new Set(pc.getSenders().map((s) => s.track?.id).filter(Boolean));
    stream.getTracks().forEach((track) => {
      if (!senderTrackIds.has(track.id)) {
        pc.addTrack(track, stream);
      }
    });
  };

  useEffect(() => {
    if (!sessionId) return;

    let isSubscribed = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const access = data.session?.access_token;
      if (!access) {
        router.replace("/auth/login");
        return;
      }
      if (isSubscribed) setToken(access);

      try {
        const [sessionData, msgs, snapshots] = await Promise.all([
          backendApi.getSession(access, sessionId),
          backendApi.listMessages(access, sessionId),
          backendApi.listSnapshots(access, sessionId).catch(() => []),
        ]);
        
        if (!isSubscribed) return;
        setSession(sessionData);
        setMessages(msgs);
        if (snapshots.length > 0) {
          setCode(snapshots[0].content);
          setLanguage(snapshots[0].editor_language);
        }
        setLoading(false);

        const socket = getSocket(access);

        const joinRoom = () => {
          socket.emit("session:join", { sessionId });
        };

        const onConnect = () => {
          setConnected(true);
          joinRoom();
        };

        const onDisconnect = () => setConnected(false);

        const onEditorUpdate = (payload: { content: string; language: string }) => {
          setCode(payload.content);
          setLanguage(payload.language);
        };

        const onPresenceJoined = (payload: { user: Participant; sid: string }) => {
          setParticipants((prev) => ({ ...prev, [payload.sid]: payload.user }));
        };

        const onPresenceLeft = (payload: { sid: string }) => {
          setParticipants((prev) => {
            const next = { ...prev };
            delete next[payload.sid];
            return next;
          });
        };

        const onTyping = (payload: { sid: string; isTyping: boolean }) => {
          setParticipants((prev) => {
            if (!prev[payload.sid]) return prev;
            return {
              ...prev,
              [payload.sid]: { ...prev[payload.sid], isTyping: payload.isTyping },
            };
          });
        };

        const onChatMessage = (payload: { message: string; sender: { id: string; role: string }; createdAt: string; messageType?: "text" | "code" }) => {
          setMessages((prev) => prev.concat({
            id: crypto.randomUUID(),
            session_id: sessionId,
            sender_id: payload.sender.id,
            sender_role: payload.sender.role,
            message_type: payload.messageType ?? "text",
            body: payload.message,
            created_at: payload.createdAt,
          }));
        };

        const onChatSystem = (payload: { message: string; createdAt: string }) => {
          setMessages((prev) => prev.concat({
            id: crypto.randomUUID(),
            session_id: sessionId,
            sender_id: "system",
            sender_role: "system",
            message_type: "system",
            body: payload.message,
            created_at: payload.createdAt,
          }));
        };

        const onWebrtcSignal = async (payload: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
          const pc = ensurePeer(access);
          
          if (localStream.current) {
            attachLocalTracks(pc, localStream.current);
          }

          try {
            if (payload.type === "offer" && payload.sdp) {
              // Only process offer if stable
              if (pc.signalingState !== "stable") {
                await pc.setLocalDescription({ type: "rollback" as RTCSdpType });
              }
              await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("webrtc:signal", { sessionId, type: "answer", sdp: answer.sdp });
            } else if (payload.type === "answer" && payload.sdp) {
              // Only process answer if we have sent an offer
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
              }
            } else if (payload.type === "candidate" && payload.candidate) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(payload.candidate);
              }
            }
          } catch (e) {
            console.warn("WebRTC Signal handling error (ignoring race condition):", e);
          }
        };

        const onSessionEnded = () => {
          router.push("/dashboard");
        };

        socket.off("connect", onConnect);
        socket.on("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.on("disconnect", onDisconnect);
        socket.on("editor:update", onEditorUpdate);
        socket.on("editor:typing", onTyping);
        socket.on("presence:joined", onPresenceJoined);
        socket.on("presence:left", onPresenceLeft);
        socket.on("chat:message", onChatMessage);
        socket.on("chat:system", onChatSystem);
        socket.on("webrtc:signal", onWebrtcSignal);
        socket.on("session:ended", onSessionEnded);

        if (socket.connected) {
          setConnected(true);
          joinRoom();
        }
      } catch (e) {
        if (isSubscribed) {
          setErr(e instanceof Error ? e.message : "Failed to load session");
          setLoading(false);
        }
      }
    })();

    return () => {
      isSubscribed = false;
      const socket = getSocket(token);
      socket?.off("editor:update");
      socket?.off("editor:typing");
      socket?.off("presence:joined");
      socket?.off("presence:left");
      socket?.off("chat:message");
      socket?.off("chat:system");
      socket?.off("webrtc:signal");
      socket?.off("session:ended");
      
      disconnectSocket();
      peerRef.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, sessionId]);

  const onEditorChange = (value?: string) => {
    if (!token) return;
    const content = value ?? "";
    setCode(content);
    const socket = getSocket(token);
    socket.emit("editor:update", { sessionId, content, language, version: Date.now() });

    // Handle typing indicator
    socket.emit("editor:typing", { sessionId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("editor:typing", { sessionId, isTyping: false });
    }, 2000);
  };

  const saveSnapshot = async () => {
    if (!token) return;
    try {
      await backendApi.saveSnapshot(token, sessionId, { editor_language: language, content: code, version: Date.now() });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save snapshot");
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !token) return;

    const text = message.trim();
    const type = text.startsWith("```") ? "code" : "text";
    try {
      const socket = getSocket(token);
      if (socket.connected) {
        socket.emit("chat:message", { sessionId, message: text, messageType: type });
      } else {
        await backendApi.sendMessage(token, sessionId, text, type);
      }
      setMessage("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send");
    }
  };

  const runCode = async () => {
    if (!token) return;
    setRunning(true);
    setShowOutput(true);
    try {
      const result = await backendApi.runCode(token, sessionId, { language, code, stdin });
      setRunOut(result.stdout || "");
      setRunErr(result.stderr || "");
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const startCall = async () => {
    if (!token) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;

      const pc = ensurePeer(token);
      attachLocalTracks(pc, stream);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      const socket = getSocket(token);
      socket.emit("webrtc:signal", { sessionId, type: "offer", sdp: offer.sdp });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not access camera/mic");
    }
  };

  const stopCall = () => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;

    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
  };

  const endSession = async () => {
    if (!token || !session) return;
    try {
      const updated = await backendApi.setSessionStatus(token, session.id, "ended");
      setSession(updated);
      
      // Notify other participants to redirect
      const socket = getSocket(token);
      if (socket.connected) {
        socket.emit("session:end", { sessionId });
      }
      
      router.push("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to end session");
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white">
        <div className="text-center animate-fade-in">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-sm opacity-70">Loading session...</p>
        </div>
      </main>
    );
  }

  const participantList = Object.entries(participants);

  return (
    <main className="relative min-h-screen p-3 md:p-4 bg-slate-950 text-slate-100 overflow-hidden" style={{ zIndex: 1 }}>
      {/* Header */}
      <header className="glass-card mb-3 flex flex-wrap items-center justify-between gap-2 p-4 animate-fade-in">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="btn-secondary px-3 py-2 text-sm"
            onClick={() => router.push("/dashboard")}
            title="Back to Dashboard"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              {session?.title ?? "Session"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge ${connected ? "badge-connected" : "badge-disconnected"}`}>
                <span className="dot-pulse" style={{ background: connected ? "#4ade80" : "#f87171" }} />
                {connected ? "Live" : "Offline"}
              </span>
              <span className="badge opacity-70 uppercase text-[10px]">{session?.status}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-sm px-3 py-2" onClick={saveSnapshot}>
            💾 Save
          </button>
          <button className="btn-primary text-sm px-3 py-2" onClick={startCall}>
            📹 Video
          </button>
          <button className="btn-secondary text-sm px-3 py-2" onClick={stopCall}>
            📵 Stop
          </button>
          <button className="btn-danger text-sm px-3 py-2" onClick={endSession}>
            ⏹ End
          </button>
        </div>
      </header>

      {err && <div className="error-banner mb-3 animate-fade-in">{err}</div>}

      {/* Main Grid */}
      <section className="grid gap-3 lg:grid-cols-[1fr_360px]" style={{ height: "calc(100vh - 120px)" }}>
        <div className="glass-card flex flex-col overflow-hidden animate-fade-in-delay-1">
          <div className="flex items-center justify-between border-b px-4 py-3 border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-500/50" />
                <span className="h-3 w-3 rounded-full bg-amber-500/50" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-xs font-semibold opacity-50 uppercase tracking-wider">Editor</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input-field text-sm !py-1 !px-2 w-auto"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </select>
              <button
                className="btn-primary text-sm !py-1 !px-4"
                onClick={runCode}
                disabled={running}
              >
                {running ? "..." : "▶ Run"}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-[#1e1e1e]">
            <MonacoEditor
              height="100%"
              language={language}
              value={code}
              onChange={onEditorChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                cursorBlinking: "smooth",
                smoothScrolling: true,
              }}
            />
          </div>

          <div className="border-t border-white/5">
            {showOutput && (
              <div className="grid grid-cols-2 h-32 border-b border-white/5 bg-black/20">
                <div className="p-3 overflow-auto">
                  <div className="text-[10px] opacity-40 font-bold mb-1 uppercase">Output</div>
                  <pre className="text-xs text-emerald-400 font-mono">{runOut || "_"}</pre>
                </div>
                <div className="p-3 overflow-auto border-l border-white/5">
                  <div className="text-[10px] opacity-40 font-bold mb-1 uppercase">Errors</div>
                  <pre className="text-xs text-red-400 font-mono">{runErr || "_"}</pre>
                </div>
              </div>
            )}
            <div className="p-2 bg-black/10">
              <input
                className="input-field !py-2 !px-3 text-xs w-full bg-transparent border-transparent hover:border-white/10"
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="Standard input (stdin)..."
              />
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3 min-h-0 animate-fade-in-delay-2">
          <div className="glass-card p-4">
            <h2 className="text-xs font-bold opacity-40 uppercase tracking-widest mb-3">Participants</h2>
            <div className="flex flex-wrap gap-2">
              {participantList.length === 0 ? (
                <span className="text-xs opacity-30 italic">Connect to see others...</span>
              ) : (
                participantList.map(([sid, p]) => (
                  <div key={sid} className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium">{p.email?.split("@")[0] || 'Peer'}</span>
                    {p.isTyping && <span className="text-[10px] opacity-50 italic">typing...</span>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card flex flex-1 flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
              <span className="text-xs font-bold opacity-40 uppercase tracking-widest">Chat</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5">{messages.length}</span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.sender_role === "system" ? "items-center" : ""}`}>
                  {m.sender_role === "system" ? (
                    <span className="text-[10px] opacity-30 bg-white/5 px-3 py-1 rounded-full italic">{m.body}</span>
                  ) : (
                    <div className="max-w-[90%]">
                       <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase ${m.sender_role === 'mentor' ? 'text-amber-400' : 'text-blue-400'}`}>
                            {m.sender_role}
                          </span>
                       </div>
                       <div className={`p-3 rounded-2xl text-sm ${m.sender_role === 'mentor' ? 'bg-amber-500/10 text-amber-50' : 'bg-blue-500/10 text-blue-50'} border border-white/5`}>
                          {m.body}
                       </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="p-3 border-t border-white/5 flex gap-2" onSubmit={sendMessage}>
              <input
                className="input-field flex-1 !py-2"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Say hello..."
              />
              <button className="btn-primary !p-2" type="submit">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>

          <div className="glass-card p-3">
             <div className="grid grid-cols-2 gap-2 h-32">
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/5">
                   <video ref={localVideo} autoPlay muted playsInline className="h-full w-full object-cover" />
                   <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[10px] font-bold px-2 py-1">You</span>
                   </div>
                </div>
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/5">
                   <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-cover" />
                   <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[10px] font-bold px-2 py-1">Remote</span>
                   </div>
                </div>
             </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
