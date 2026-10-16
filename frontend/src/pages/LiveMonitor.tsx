import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Clock3,
  MonitorUp,
  Radio,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import { send, useResource } from "../api";
import type { Overview } from "../types";
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader } from "../ui";

type CandidateRow = {
  invitation_id: string;
  interview_id: string | null;
  candidate_name: string;
  candidate_email: string;
  status: string;
  question_count: number;
  completed_questions: number;
  current_question: { ordinal: number; title: string; topic: string } | null;
  evaluation_pending: boolean;
  provisional_score: number | null;
  time_remaining_seconds: number;
  camera_consented: boolean;
  screen_consented: boolean;
};
type MonitorData = {
  drive_id: string;
  drive_name: string;
  position: string;
  live_media_available: boolean;
  refreshed_at: string;
  candidates: CandidateRow[];
};

function timeLabel(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function LiveTile({ candidate }: { candidate: CandidateRow }) {
  const cameraRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const [connection, setConnection] = useState("connecting");
  const [cameraLive, setCameraLive] = useState(false);
  const [screenLive, setScreenLive] = useState(false);
  useEffect(() => {
    let mounted = true;
    let room: Room | null = null;
    const clearTrack = (track: { detach: (element?: HTMLMediaElement) => HTMLMediaElement[] }) => {
      if (cameraRef.current) track.detach(cameraRef.current);
      if (screenRef.current) track.detach(screenRef.current);
    };
    if (!candidate.interview_id || !candidate.camera_consented) {
      setConnection("camera not shared");
      setCameraLive(false);
      setScreenLive(false);
      return;
    }
    const cameraSubscribed = (track: any, publication: any) => {
      if (track.kind !== Track.Kind.Video) return;
      if (publication.source === Track.Source.ScreenShare) {
        if (screenRef.current) track.attach(screenRef.current);
        if (mounted) setScreenLive(true);
      } else if (publication.source === Track.Source.Camera) {
        if (cameraRef.current) track.attach(cameraRef.current);
        if (mounted) setCameraLive(true);
      }
    };
    const cameraUnsubscribed = (track: any, publication: any) => {
      clearTrack(track);
      if (mounted && publication.source === Track.Source.ScreenShare)
        setScreenLive(false);
      if (mounted && publication.source === Track.Source.Camera)
        setCameraLive(false);
    };
    const connect = async () => {
      try {
        const credentials = await send<{ url: string; token: string }>(
          `/interviews/${encodeURIComponent(candidate.interview_id!)}/monitor-token/`,
          {},
        );
        if (!mounted) return;
        room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.TrackSubscribed, cameraSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, cameraUnsubscribed);
        room.on(RoomEvent.Disconnected, () => {
          if (mounted) setConnection("reconnecting");
        });
        await room.connect(credentials.url, credentials.token);
        if (mounted) setConnection("connected");
      } catch {
        if (mounted) setConnection("unavailable");
      }
    };
    void connect();
    return () => {
      mounted = false;
      if (cameraRef.current) cameraRef.current.srcObject = null;
      if (screenRef.current) screenRef.current.srcObject = null;
      room?.disconnect();
    };
  }, [candidate.interview_id, candidate.camera_consented]);

  return (
    <article className="monitor-candidate-card">
      <div className="monitor-candidate-heading">
        <div>
          <strong>{candidate.candidate_name}</strong>
          <small>{candidate.candidate_email}</small>
        </div>
        <Badge tone={candidate.status === "in_progress" ? "green" : "neutral"}>
          {candidate.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className={`monitor-media-grid${screenLive ? " has-screen" : ""}`}>
        <div className="monitor-video-frame">
          <video ref={cameraRef} autoPlay playsInline muted />
          {!cameraLive && (
            <div className="monitor-media-placeholder">
              {candidate.camera_consented ? <WifiOff size={22} /> : <Camera size={22} />}
              <span>
                {!candidate.camera_consented
                  ? "Camera consent not recorded"
                  : connection === "unavailable"
                    ? "Camera connection unavailable"
                    : connection === "reconnecting"
                      ? "Reconnecting camera…"
                      : "Waiting for camera"}
              </span>
            </div>
          )}
          <span className="monitor-video-label"><Camera size={13} /> Camera</span>
        </div>
        <div className="monitor-video-frame monitor-screen-frame">
          <video ref={screenRef} autoPlay playsInline muted />
          {!screenLive && (
            <div className="monitor-media-placeholder">
              <MonitorUp size={22} />
              <span>Screen not shared</span>
            </div>
          )}
          <span className="monitor-video-label"><MonitorUp size={13} /> Candidate screen</span>
        </div>
      </div>
      <div className="monitor-candidate-stats">
        <div><span>Progress</span><strong>{candidate.completed_questions}/{candidate.question_count}</strong></div>
        <div><span>Time left</span><strong>{timeLabel(candidate.time_remaining_seconds)}</strong></div>
        <div>
          <span>Provisional score</span>
          <strong>{candidate.provisional_score === null ? "—" : `${Math.round(candidate.provisional_score)}%`}</strong>
        </div>
      </div>
      {candidate.evaluation_pending ? (
        <p className="monitor-question-note">Answer evaluation is pending; the provisional score will update when it finishes.</p>
      ) : candidate.current_question ? (
        <p className="monitor-question-note">
          Q{candidate.current_question.ordinal} · {candidate.current_question.topic} · {candidate.current_question.title}
        </p>
      ) : candidate.status === "completed" ? (
        <p className="monitor-question-note">Interview submitted.</p>
      ) : null}
    </article>
  );
}

export default function LiveMonitor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [selectedInterview, setSelectedInterview] = useState("");
  const { data: overview } = useResource<Overview>("/overview/");
  const driveId = search.get("drive") || id || overview?.drives.find((drive) => drive.status === "active")?.id || overview?.drives[0]?.id || "";
  const { data, error, loading, reload } = useResource<MonitorData>(driveId ? `/drives/${driveId}/live/` : "/health/");
  useEffect(() => {
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [reload]);
  const activeRows = data && "candidates" in data
    ? data.candidates.filter((candidate) => ["in_progress", "disconnected"].includes(candidate.status))
    : [];
  const activeKeys = activeRows.map((candidate) => candidate.interview_id || candidate.invitation_id).join("|");
  useEffect(() => {
    if (!activeRows.length) setSelectedInterview("");
    else if (!activeRows.some((candidate) => candidate.interview_id === selectedInterview))
      setSelectedInterview(activeRows[0].interview_id || "");
  }, [activeKeys]);
  if (overview && !overview.drives.length) return <section className="panel"><Empty title="Create a drive to start monitoring" description="Once you launch a drive, live candidate rooms and progress will appear here." action={<Link className="button primary" to="/drives">Open interview drives</Link>} /></section>;
  if (loading && (!data || !driveId)) return <Loading />;
  if (!driveId) return <Loading />;
  if (error || !data || !("candidates" in data)) return <ErrorBox message={error || "Live drive data is unavailable."} retry={reload} />;
  const activeCount = data.candidates.filter((candidate) => candidate.status === "in_progress").length;
  const selectedCandidate = activeRows.find((candidate) => candidate.interview_id === selectedInterview);
  return (
    <div className="live-monitor-page">
      <Link className="back-link" to={`/drives/${id}`}><ArrowLeft size={16} /> Drive overview</Link>
      <PageHeader
        eyebrow={`${data.position.toUpperCase()} · LIVE MONITOR`}
        title={data.drive_name}
        description="Watch active interview progress. Scores shown here are provisional and based only on evaluated answers."
        action={<Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>}
      />
      <label className="monitor-drive-picker">Select interview drive
        <select value={driveId} onChange={(event) => navigate(`/live-monitor?drive=${encodeURIComponent(event.target.value)}`)}>
          {(overview?.drives || []).map((drive) => <option key={drive.id} value={drive.id}>{drive.name} · {drive.position}</option>)}
        </select>
      </label>
      {!data.live_media_available && (
        <div className="notice monitor-config-notice">
          <WifiOff size={17} /> Live video is not configured on this deployment. Candidate interviews and progress tracking continue normally.
        </div>
      )}
      <section className="monitor-overview-stats">
        <article><span className="monitor-stat-icon"><Radio size={17} /></span><strong>{activeCount}</strong><small>In progress now</small></article>
        <article><span className="monitor-stat-icon"><UsersRound size={17} /></span><strong>{data.candidates.length}</strong><small>Drive candidates</small></article>
        <article><span className="monitor-stat-icon"><Clock3 size={17} /></span><strong>{data.candidates.filter((candidate) => candidate.status === "completed").length}</strong><small>Submitted</small></article>
      </section>
      <div className="monitor-section-heading">
        <div><span className="eyebrow">ACTIVE ROOMS</span><h2>{activeRows.length} candidate{activeRows.length === 1 ? "" : "s"}</h2></div>
        <span className="monitor-refresh-caption">Updated {new Date(data.refreshed_at).toLocaleTimeString()}</span>
      </div>
      {activeRows.length ? (
        <section className="monitor-layout">
          <div className="monitor-candidate-list" aria-label="Active candidates">
            {activeRows.map((candidate) => (
              <button
                className={`monitor-list-row${candidate.interview_id === selectedInterview ? " selected" : ""}`}
                key={candidate.interview_id || candidate.invitation_id}
                onClick={() => setSelectedInterview(candidate.interview_id || "")}
              >
                <span className={`monitor-row-indicator ${candidate.status}`} />
                <span className="monitor-row-main"><strong>{candidate.candidate_name}</strong><small>{candidate.completed_questions}/{candidate.question_count} questions · {timeLabel(candidate.time_remaining_seconds)} left</small></span>
                <span className="monitor-row-score">{candidate.provisional_score === null ? "—" : `${Math.round(candidate.provisional_score)}%`}</span>
              </button>
            ))}
          </div>
          {selectedCandidate?.interview_id ? <LiveTile candidate={selectedCandidate} /> : <section className="panel"><Empty title="This interview is not active" description="Choose a candidate with an active room to open their live camera and screen status." /></section>}
        </section>
      ) : (
        <section className="panel"><Empty title="No candidate is in the interview room" description="Candidates appear here when they start this drive. This view refreshes automatically every few seconds." /></section>
      )}
      <section className="monitor-privacy-note"><ShieldCheck size={18} /><p>Live media is visible only to authorized workspace recruiters. HireLens does not record camera or screen streams. Screen sharing starts only when the candidate chooses a screen in their browser.</p></section>
    </div>
  );
}
