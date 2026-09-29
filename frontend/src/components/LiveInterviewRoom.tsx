import { useEffect, useRef, useState } from "react";
import {
  Captions,
  CircleStop,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
  CircleHelp,
  Wifi,
  WifiOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { send } from "../api";
import LensArtwork from "./LensArtwork";
import { Button, ErrorBox } from "../ui";

type LiveToken = {
  token: string;
  model: string;
  expires_at: string;
  attempt_id: string;
};

type LiveAttempt = {
  id: string;
  ordinal: number;
  title: string;
  topic: string;
  prompt: string;
  kind: string;
};

type Props = {
  interviewId: string;
  tabId: string;
  attempt: LiveAttempt;
  disabled?: boolean;
  questionOnly?: boolean;
  onQuestionReady?: () => void;
  onTranscript: (value: string) => void;
  onFinalAnswer: (value: string) => void;
};

type RoomState =
  | "preflight"
  | "checking"
  | "ready_to_join"
  | "connecting"
  | "speaking"
  | "ready"
  | "listening"
  | "finishing"
  | "review"
  | "clarifying"
  | "reconnecting"
  | "fallback";

type NetworkState = { online: boolean; detail: string };

type ExtendedNavigator = Navigator & {
  connection?: EventTarget & {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
};

function mergeTranscript(current: string, incoming: string) {
  const next = incoming.replace(/\s+/g, " ").trim();
  if (!next) return current;
  if (!current) return next;
  if (next.startsWith(current)) return next;
  if (current.endsWith(next) || current.includes(next)) return current;
  return `${current} ${next}`;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function pcm16(samples: Float32Array, inputRate: number) {
  const targetRate = 16000;
  const ratio = inputRate / targetRate;
  const length = Math.floor(samples.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const value = Math.max(
      -1,
      Math.min(1, samples[Math.floor(i * ratio)] || 0),
    );
    output[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return new Uint8Array(output.buffer);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function LiveInterviewRoom({
  interviewId,
  tabId,
  attempt,
  disabled = false,
  questionOnly = false,
  onQuestionReady,
  onTranscript,
  onFinalAnswer,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);
  const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const playingUntil = useRef(0);
  const capturing = useRef(false);
  const transcriptRef = useRef("");
  const questionSpoken = useRef(false);
  const fallbackTimer = useRef<number | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const stateRef = useRef<RoomState>("preflight");
  const lastVoiceAtRef = useRef(0);
  const clarificationUsedRef = useRef(false);
  const awaitingClarificationRef = useRef(false);
  const finishRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<RoomState>("preflight");
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [soundLevel, setSoundLevel] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [network, setNetwork] = useState<NetworkState>({
    online: navigator.onLine,
    detail: "Checking connection…",
  });
  const [helpOpen, setHelpOpen] = useState(false);

  function updateTranscript(value: string) {
    transcriptRef.current = mergeTranscript(transcriptRef.current, value);
    setTranscript(transcriptRef.current);
    onTranscript(transcriptRef.current);
    if (stateRef.current === "finishing" && finalizeTimerRef.current) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = window.setTimeout(commitTranscript, 850);
    }
  }

  function setRoomState(next: RoomState) {
    stateRef.current = next;
    setState(next);
  }

  function refreshNetwork() {
    const connection = (navigator as ExtendedNavigator).connection;
    const detail = !navigator.onLine
      ? "Offline"
      : connection?.effectiveType
        ? `${connection.effectiveType}${connection.rtt ? ` · ${connection.rtt} ms` : ""}`
        : "Online";
    setNetwork({ online: navigator.onLine, detail });
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextCameras = devices.filter(
      (device) => device.kind === "videoinput",
    );
    const nextMics = devices.filter((device) => device.kind === "audioinput");
    setCameras(nextCameras);
    setMicrophones(nextMics);
    setCameraId((current) =>
      nextCameras.some((device) => device.deviceId === current)
        ? current
        : nextCameras[0]?.deviceId || "",
    );
    setMicrophoneId((current) =>
      nextMics.some((device) => device.deviceId === current)
        ? current
        : nextMics[0]?.deviceId || "",
    );
  }

  function stopMonitor() {
    if (monitorFrameRef.current) cancelAnimationFrame(monitorFrameRef.current);
    monitorFrameRef.current = null;
    monitorSourceRef.current?.disconnect();
    monitorSourceRef.current = null;
    monitorContextRef.current?.close().catch(() => undefined);
    monitorContextRef.current = null;
  }

  async function startMonitor(stream: MediaStream) {
    stopMonitor();
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    monitorContextRef.current = context;
    monitorSourceRef.current = source;
    await context.resume();
    const values = new Uint8Array(analyser.fftSize);
    const frame = () => {
      analyser.getByteTimeDomainData(values);
      const rms = Math.sqrt(
        values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
          values.length,
      );
      setSoundLevel(Math.min(1, rms * 7));
      monitorFrameRef.current = requestAnimationFrame(frame);
    };
    frame();
  }

  function stopAiAudio() {
    for (const source of outputSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may have already completed.
      }
    }
    outputSourcesRef.current.clear();
    playingUntil.current = 0;
  }

  function stopAudioCapture() {
    capturing.current = false;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    gainRef.current = null;
  }

  function stopLiveConnection() {
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    if (reconnectTimerRef.current)
      window.clearTimeout(reconnectTimerRef.current);
    fallbackTimer.current = null;
    reconnectTimerRef.current = null;
    intentionalCloseRef.current = true;
    stopAudioCapture();
    stopAiAudio();
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
  }

  async function runPreflight() {
    stopMedia();
    setError("");
    setCaption("");
    setSoundLevel(0);
    setRoomState("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: cameraId ? undefined : "user",
          ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setMicMuted(false);
      await refreshDevices();
      await startMonitor(stream);
      setRoomState("ready_to_join");
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Allow camera and microphone access to join the live interview."
          : e instanceof DOMException && e.name === "NotFoundError"
            ? "No usable camera or microphone was found. Connect a device, then try again."
            : "We could not complete the device check. Choose another device and try again.";
      setError(message);
      setRoomState("preflight");
    }
  }

  function stopMedia() {
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    if (reconnectTimerRef.current)
      window.clearTimeout(reconnectTimerRef.current);
    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    fallbackTimer.current = null;
    reconnectTimerRef.current = null;
    finalizeTimerRef.current = null;
    intentionalCloseRef.current = true;
    stopAudioCapture();
    stopAiAudio();
    stopMonitor();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    audioRef.current?.close().catch(() => undefined);
    audioRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
  }

  function moveToFallback(message: string) {
    stopLiveConnection();
    setCameraOn(
      Boolean(
        streamRef.current
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      ),
    );
    setMicMuted(false);
    setRetryAvailable(true);
    setError(message);
    setRoomState("fallback");
  }

  useEffect(() => {
    refreshNetwork();
    refreshDevices().catch(() => undefined);
    const online = () => refreshNetwork();
    const devices = () => refreshDevices().catch(() => undefined);
    const connection = (navigator as ExtendedNavigator).connection;
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    connection?.addEventListener("change", online);
    navigator.mediaDevices?.addEventListener("devicechange", devices);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      connection?.removeEventListener("change", online);
      navigator.mediaDevices?.removeEventListener("devicechange", devices);
      stopMedia();
    };
  }, []);

  async function playPcm(data: string, mimeType = "audio/pcm;rate=24000") {
    const context = audioRef.current;
    if (!context) return;
    try {
      // A browser may suspend an AudioContext after an async token request.
      // Resume it immediately before scheduling the first Gemini chunk.
      if (context.state !== "running") await context.resume();
      const bytes = decodeBase64(data);
      const usableLength = bytes.byteLength - (bytes.byteLength % 2);
      if (!usableLength) return;
      const pcm = new Int16Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usableLength),
      );
      const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || "24000");
      const buffer = context.createBuffer(1, pcm.length, rate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      outputSourcesRef.current.add(source);
      const startAt = Math.max(context.currentTime, playingUntil.current);
      source.start(startAt);
      playingUntil.current = startAt + buffer.duration;
      questionSpoken.current = true;
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
      setRoomState("speaking");
      source.onended = () => {
        outputSourcesRef.current.delete(source);
        if (!capturing.current && !outputSourcesRef.current.size)
          setRoomState(
            awaitingClarificationRef.current ? "clarifying" : "ready",
          );
      };
    } catch {
      // Keep the live room usable if one malformed provider chunk is received.
      setError(
        "Gemini audio could not be played. Check your speaker volume or retry the live room.",
      );
      setRetryAvailable(true);
    }
  }

  function speakFallback() {
    if (
      questionSpoken.current ||
      !window.speechSynthesis ||
      outputSourcesRef.current.size
    )
      return;
    questionSpoken.current = true;
    const utterance = new SpeechSynthesisUtterance(
      `${attempt.title}. ${attempt.prompt}`,
    );
    utterance.rate = 0.94;
    utterance.onstart = () => setRoomState("speaking");
    utterance.onend = () => setRoomState("ready");
    utterance.onerror = () => setRoomState("ready");
    window.speechSynthesis.speak(utterance);
  }

  function liveErrorMessage(error: Record<string, any>) {
    const code = String(error.code || "");
    if (code === "429" || code.toLowerCase().includes("quota"))
      return "Gemini is temporarily at capacity. Your camera and microphone are still connected; retry live audio in a moment.";
    if (code === "401" || code === "403")
      return "The live interviewer session was not authorized. Check the Gemini API configuration and retry.";
    return "The live interviewer connection was interrupted. Your camera and microphone are still connected; retry live audio to continue.";
  }

  function handleLiveMessage(event: MessageEvent<string>) {
    let message: Record<string, any>;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.error) {
      // Do not call stopMedia here: it stops the candidate's tracks and turns
      // the mic off after the first provider error. Preserve the preflight
      // stream so a new constrained token can be tried without re-permission.
      moveToFallback(liveErrorMessage(message.error));
      return;
    }
    if (message.setupComplete || message.setup_complete) {
      const socket = socketRef.current;
      if (!socket) return;
      socket.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [
                  {
                    text: "Begin the interview by asking the approved question now.",
                  },
                ],
              },
            ],
            turnComplete: true,
          },
        }),
      );
      setRetryAvailable(false);
      fallbackTimer.current = window.setTimeout(speakFallback, 3500);
      return;
    }
    const content = message.serverContent || message.server_content;
    if (!content) return;
    const input = content.inputTranscription || content.input_transcription;
    if (input?.text) updateTranscript(input.text);
    const output = content.outputTranscription || content.output_transcription;
    if (output?.text) {
      setCaption((current) => mergeTranscript(current, output.text));
    }
    const parts = content.modelTurn?.parts || content.model_turn?.parts || [];
    for (const part of parts) {
      const audio = part.inlineData || part.inline_data;
      if (audio?.data) playPcm(audio.data, audio.mimeType || audio.mime_type);
    }
    if (
      content.turnComplete &&
      !capturing.current &&
      stateRef.current === "speaking" &&
      !outputSourcesRef.current.size
    )
      setRoomState("ready");
  }

  function beginAudioCapture(stream: MediaStream) {
    const context = audioRef.current;
    if (!context) return;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      const peak =
        samples.reduce((total, value) => total + value * value, 0) /
        samples.length;
      const level = Math.min(1, Math.sqrt(peak) * 7);
      setSoundLevel(level);
      if (capturing.current && level > 0.035)
        lastVoiceAtRef.current = Date.now();
      if (
        !capturing.current ||
        socketRef.current?.readyState !== WebSocket.OPEN
      )
        return;
      socketRef.current.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: base64(pcm16(samples, context.sampleRate)),
              mimeType: "audio/pcm;rate=16000",
            },
          },
        }),
      );
      if (
        capturing.current &&
        transcriptRef.current.length > 10 &&
        lastVoiceAtRef.current &&
        Date.now() - lastVoiceAtRef.current > 2600
      )
        finishRef.current();
    };
    sourceRef.current = source;
    processorRef.current = processor;
    gainRef.current = silentGain;
  }

  function scheduleReconnect(message: string) {
    if (intentionalCloseRef.current || stateRef.current === "fallback") return;
    reconnectAttemptRef.current += 1;
    if (reconnectAttemptRef.current > 3) {
      moveToFallback(
        "The live connection could not be restored. Your camera and microphone remain available; retry live audio or continue with the typed response.",
      );
      return;
    }
    setError(`${message} Reconnecting (${reconnectAttemptRef.current}/3)…`);
    setRoomState("reconnecting");
    reconnectTimerRef.current = window.setTimeout(
      () => join(true),
      reconnectAttemptRef.current * 1200,
    );
  }

  async function join(reconnecting = false) {
    const stream = streamRef.current;
    if (!stream) {
      setError(
        "Run the camera and microphone check before joining the live room.",
      );
      setRoomState("preflight");
      return;
    }
    intentionalCloseRef.current = false;
    if (!reconnecting) {
      setError("");
      setCaption("");
      transcriptRef.current = "";
      setTranscript("");
      setSoundLevel(0);
      questionSpoken.current = false;
      reconnectAttemptRef.current = 0;
      clarificationUsedRef.current = false;
      awaitingClarificationRef.current = false;
    }
    stopMonitor();
    setRoomState(reconnecting ? "reconnecting" : "connecting");
    try {
      if (!audioRef.current) {
        const context = new AudioContext();
        audioRef.current = context;
        await context.resume();
      }
      if (!processorRef.current) beginAudioCapture(stream);
      const live = await send<LiveToken>(
        `/interviews/${interviewId}/live-token/`,
        {
          tab_id: tabId,
        },
      );
      if (live.attempt_id !== attempt.id)
        throw new Error(
          "The question changed. Refresh to join the current turn.",
        );
      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(live.token)}`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${live.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: { disabled: true },
              },
            },
          }),
        );
      };
      socket.onmessage = handleLiveMessage;
      socket.onerror = () => {
        setError(
          "The live connection was interrupted. Reconnecting while your devices stay connected…",
        );
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        scheduleReconnect("The Gemini connection dropped.");
      };
    } catch (e) {
      if (reconnecting) {
        scheduleReconnect("The Gemini connection is still unavailable.");
      } else {
        moveToFallback(
          "The live room could not start. Your camera and microphone are still connected; retry live audio or use the typed response.",
        );
      }
    }
  }

  function startAnswer() {
    if (disabled || socketRef.current?.readyState !== WebSocket.OPEN) return;
    window.speechSynthesis?.cancel();
    stopAiAudio();
    setCaption("");
    if (awaitingClarificationRef.current) {
      transcriptRef.current =
        `${transcriptRef.current.trim()} Clarification:`.trim();
      awaitingClarificationRef.current = false;
    } else {
      transcriptRef.current = "";
    }
    setTranscript(transcriptRef.current);
    capturing.current = true;
    lastVoiceAtRef.current = Date.now();
    socketRef.current.send(
      JSON.stringify({ realtimeInput: { activityStart: {} } }),
    );
    setRoomState("listening");
  }

  function retryLiveAudio() {
    if (disabled || !streamRef.current) return;
    setRetryAvailable(false);
    setError("");
    reconnectAttemptRef.current = 0;
    join(true);
  }

  function commitTranscript() {
    finalizeTimerRef.current = null;
    const answer = transcriptRef.current.trim();
    if (!answer) {
      setError(
        "We did not receive speech. Check your microphone and try again, or use the typed accessibility response.",
      );
      setRoomState("ready");
      return;
    }
    if (!questionOnly && !clarificationUsedRef.current) {
      setRoomState("review");
      return;
    }
    onFinalAnswer(answer);
  }

  function requestClarification() {
    if (
      disabled ||
      clarificationUsedRef.current ||
      socketRef.current?.readyState !== WebSocket.OPEN
    )
      return;
    clarificationUsedRef.current = true;
    awaitingClarificationRef.current = true;
    setError("");
    setRoomState("speaking");
    socketRef.current.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: "The candidate has finished the approved question. Ask exactly one concise, neutral clarification about their answer or the same question. Do not provide a hint, answer, score, rubric, feedback, or a new question. Then wait silently.",
                },
              ],
            },
          ],
          turnComplete: true,
        },
      }),
    );
  }

  function finishAnswer() {
    if (!capturing.current || !socketRef.current) return;
    capturing.current = false;
    setRoomState("finishing");
    socketRef.current.send(
      JSON.stringify({ realtimeInput: { activityEnd: {} } }),
    );
    finalizeTimerRef.current = window.setTimeout(commitTranscript, 1600);
  }
  finishRef.current = finishAnswer;

  function toggleMicrophone() {
    const next = !micMuted;
    streamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = !next));
    setMicMuted(next);
  }

  function toggleCamera() {
    const next = !cameraOn;
    streamRef.current
      ?.getVideoTracks()
      .forEach((track) => (track.enabled = next));
    setCameraOn(next);
  }

  function submitTyped() {
    const answer = typedAnswer.trim();
    if (!answer) {
      setError("Enter your answer before continuing.");
      return;
    }
    onTranscript(answer);
    onFinalAnswer(answer);
  }

  return (
    <section
      className="live-interview-room"
      aria-label="Live AI interview room"
    >
      <div className="live-room-bar">
        <span className="live-room-status">
          <i className={state === "listening" ? "listening" : ""} />
          {state === "preflight"
            ? "Device check needed"
            : state === "checking"
              ? "Checking devices"
              : state === "ready_to_join"
                ? "Ready to join"
                : state === "connecting"
                  ? "Connecting securely"
                  : state === "reconnecting"
                    ? "Reconnecting securely"
                    : state === "speaking"
                      ? "Gemini is speaking"
                      : state === "listening"
                        ? "Gemini is listening"
                        : state === "finishing"
                          ? "Preparing your answer"
                          : state === "review"
                            ? "Review your answer"
                            : state === "clarifying"
                              ? "Clarification ready"
                              : state === "fallback"
                                ? "Accessibility response"
                                : "Your turn"}
        </span>
        <span>
          <ShieldCheck size={14} /> No audio or video recording
        </span>
        <button
          className="live-help-button"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        >
          <CircleHelp size={14} /> Help
        </button>
      </div>
      {helpOpen && (
        <aside className="live-help-panel">
          <strong>Need a hand?</strong>
          <p>
            Check the camera preview and audio meter, then join. You can mute
            yourself or turn off the local preview at any time. If the live
            connection drops, HireLens retries safely before offering an
            accessible typed response.
          </p>
        </aside>
      )}
      <div className="live-video-grid">
        <article
          className={`ai-interviewer-tile ${state === "speaking" ? "speaking" : ""}`}
        >
          <div className="ai-presence" aria-hidden="true">
            <LensArtwork />
            <span className="ai-orbit ai-orbit-one" />
            <span className="ai-orbit ai-orbit-two" />
          </div>
          <div className="tile-label">
            <span>
              <i /> HireLens interviewer
            </span>
            <Volume2 size={15} />
          </div>
          {caption && (
            <p className="live-caption" aria-live="polite">
              {caption}
            </p>
          )}
        </article>
        <article className="candidate-video-tile">
          <video ref={videoRef} autoPlay muted playsInline />
          {!cameraOn && <VideoOff size={32} aria-hidden="true" />}
          <div className="tile-label">
            <span>
              <Video size={14} /> You
            </span>
            <span>Local preview</span>
          </div>
          <div className="candidate-media-controls">
            <button
              onClick={toggleMicrophone}
              disabled={!streamRef.current}
              aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {micMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <button
              onClick={toggleCamera}
              disabled={!streamRef.current}
              aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {cameraOn ? <Video size={15} /> : <VideoOff size={15} />}
            </button>
          </div>
        </article>
      </div>
      <article className="live-question-card">
        <div className="live-question-kicker">
          <span>QUESTION {attempt.ordinal}</span>
          <span>{attempt.topic}</span>
        </div>
        <h2>{attempt.title}</h2>
        <p>{attempt.prompt}</p>
        <div className="live-question-note">
          <Captions size={15} /> The question stays on screen while Gemini
          speaks.
        </div>
      </article>
      {error && <ErrorBox message={error} />}
      {state === "fallback" ? (
        questionOnly ? (
          <div className="live-room-actions">
            <p>
              The code prompt remains visible. You can continue to the coding
              workspace while the live room is unavailable.
            </p>
            <Button onClick={() => onQuestionReady?.()} disabled={disabled}>
              Open coding workspace
            </Button>
          </div>
        ) : (
          <div className="live-typed-fallback">
            <div>
              <WifiOff size={18} />
              <strong>Live audio needs a retry</strong>
              <span>
                Your camera and microphone stay local and are not recorded.
                Retry live audio, or use a typed accessibility response if the
                live connection remains unavailable.
              </span>
            </div>
            <textarea
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="Write your answer here…"
              maxLength={16000}
              disabled={disabled}
            />
            <div>
              {retryAvailable && streamRef.current && (
                <Button onClick={retryLiveAudio} disabled={disabled}>
                  <RefreshCw size={16} />
                  Retry live audio
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={runPreflight}
                disabled={disabled}
              >
                <RefreshCw size={16} />
                Retry live room
              </Button>
              <Button
                onClick={submitTyped}
                disabled={disabled || !typedAnswer.trim()}
              >
                Continue with this response
              </Button>
            </div>
          </div>
        )
      ) : ["preflight", "checking", "ready_to_join"].includes(state) ? (
        <div className="live-preflight">
          <div className="live-preflight-heading">
            <div>
              <span className="eyebrow">LIVE ROOM CHECK</span>
              <h3>Set up before you join.</h3>
              <p>
                Your camera is a local preview. Only live microphone audio is
                streamed to Gemini for transcription; no media is recorded.
              </p>
            </div>
            <span className={network.online ? "network-ok" : "network-offline"}>
              {network.online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {network.detail}
            </span>
          </div>
          <div className="live-device-grid">
            <label>
              Camera
              <select
                value={cameraId}
                onChange={(event) => setCameraId(event.target.value)}
                disabled={state === "checking"}
              >
                {cameras.length ? (
                  cameras.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">Allow access to detect cameras</option>
                )}
              </select>
            </label>
            <label>
              Microphone
              <select
                value={microphoneId}
                onChange={(event) => setMicrophoneId(event.target.value)}
                disabled={state === "checking"}
              >
                {microphones.length ? (
                  microphones.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">Allow access to detect microphones</option>
                )}
              </select>
            </label>
            <div
              className="live-audio-check"
              aria-label="Microphone level check"
            >
              <Mic size={16} />
              <span>Microphone level</span>
              <i
                style={{ transform: `scaleX(${Math.max(0.04, soundLevel)})` }}
              />
            </div>
          </div>
          <div className="live-preflight-actions">
            <Button
              variant="secondary"
              onClick={runPreflight}
              disabled={disabled || state === "checking"}
            >
              <RefreshCw size={16} />
              {state === "checking"
                ? "Checking devices…"
                : "Check camera & microphone"}
            </Button>
            <Button
              onClick={() => join()}
              disabled={
                disabled || state !== "ready_to_join" || !network.online
              }
            >
              <Video size={17} /> Join live interview
            </Button>
          </div>
          {error && (
            <button
              className="live-accessibility-link"
              onClick={() => setRoomState("fallback")}
            >
              Continue with typed accessibility response
            </button>
          )}
        </div>
      ) : questionOnly ? (
        <div className="live-room-actions">
          <p>
            {state === "ready"
              ? "Gemini has asked the visible prompt. Open the coding workspace when you are ready."
              : "Gemini is preparing the visible coding prompt."}
          </p>
          <Button
            onClick={() => onQuestionReady?.()}
            disabled={disabled || state !== "ready"}
          >
            Open coding workspace
          </Button>
        </div>
      ) : state === "review" ? (
        <div className="live-review-actions">
          <div className="live-transcript">
            <span>Answer captured</span>
            <p>{transcript}</p>
          </div>
          <div className="live-review-buttons">
            <Button
              variant="secondary"
              onClick={requestClarification}
              disabled={disabled || clarificationUsedRef.current}
            >
              Ask one clarification
            </Button>
            <Button
              onClick={() => onFinalAnswer(transcriptRef.current.trim())}
              disabled={disabled || !transcriptRef.current.trim()}
            >
              Submit answer
            </Button>
          </div>
          <small>
            You may submit now or let the interviewer ask one focused follow-up.
          </small>
        </div>
      ) : (
        <div className="live-answer-console">
          <div className="mic-meter" aria-label="Microphone level">
            <Mic size={17} />
            {Array.from({ length: 10 }, (_, index) => (
              <i
                key={index}
                className={soundLevel * 10 > index ? "active" : ""}
              />
            ))}
          </div>
          <div className="live-transcript">
            <span>Live transcript</span>
            <p aria-live="polite">
              {transcript ||
                (state === "listening"
                  ? "Listening for your answer…"
                  : state === "clarifying"
                    ? "Answer the clarification when you are ready."
                    : "Start when you are ready.")}
            </p>
          </div>
          {state === "listening" ? (
            <Button variant="danger" onClick={finishAnswer} disabled={disabled}>
              <CircleStop size={17} />
              I’ve finished my answer
            </Button>
          ) : (
            <Button
              onClick={startAnswer}
              disabled={
                disabled ||
                state === "connecting" ||
                state === "reconnecting" ||
                state === "finishing"
              }
            >
              <Mic size={17} />
              {state === "speaking"
                ? "Interrupt & start answering"
                : state === "clarifying"
                  ? "Answer clarification"
                  : "Start answering"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
