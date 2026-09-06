import { memo } from "preact/compat";

type Props = {
  mode: string;
  cursor: number;
  setCursor: (v: number) => void;
  displayTime: (t: number) => string;
  hasEvents: boolean;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  setAuto: (v: boolean) => void;
  lo: number;
  hi: number;
  replaySpeed: number;
  setReplaySpeed: (v: number) => void;
};

const utc = (t: number) =>
  new Date(t).toISOString().replace("T", " ").replace(".000Z", " UTC");

function ReplayView({
  mode,
  cursor,
  setCursor,
  displayTime,
  hasEvents,
  playing,
  setPlaying,
  setAuto,
  lo,
  hi,
  replaySpeed,
  setReplaySpeed,
}: Props) {
  return (
    <section class="replay">
      <div class="section-heading">
        <h2>
          Replay the{" "}
          {mode === "demo" ? "historical week" : "loaded observations"}
        </h2>
        <span>
          {Number.isFinite(cursor) ? displayTime(cursor) : "All loaded events"}
        </span>
      </div>
      <div class="replay-line">
        <button
          disabled={!hasEvents}
          onClick={() => {
            setAuto(false);
            if (!playing && (!Number.isFinite(cursor) || cursor >= hi))
              setCursor(lo);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          disabled={!hasEvents}
          onClick={() => {
            setPlaying(false);
            setCursor(lo);
          }}
        >
          Restart
        </button>
        <input
          aria-label="Replay time"
          type="range"
          min={lo}
          max={hi}
          step="1"
          value={Number.isFinite(cursor) ? cursor : hi}
          onInput={(e) => {
            setPlaying(false);
            setCursor(+e.currentTarget.value);
          }}
        />
        <label>
          Replay speed{" "}
          <select
            value={replaySpeed}
            onChange={(e) => setReplaySpeed(+e.currentTarget.value)}
          >
            <option value="0.5">½×</option>
            <option value="1">1×</option>
            <option value="4">4×</option>
          </select>
        </label>
        <button
          onClick={() => {
            setPlaying(false);
            setCursor(Infinity);
          }}
        >
          Show all
        </button>
      </div>
      <p class="muted">
        Cumulative display through the cursor · {lo ? utc(lo) : "No events"} —{" "}
        {hi > 1 ? utc(hi) : ""}. All views and exports follow this cursor.
        Playback is a sequence of observations, not wave travel.
      </p>
    </section>
  );
}

export const Replay = memo(ReplayView);
