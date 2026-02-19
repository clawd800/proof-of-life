import { useState, useEffect } from "react";
import { useGameState } from "@/hooks/useGameState";

export function EpochTimer() {
  const { currentEpoch, epochDuration } = useGameState();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!currentEpoch || !epochDuration) return null;

  const duration = Number(epochDuration);
  const remaining = Math.max(0, (Number(currentEpoch) + 1) * duration - now);
  const progress = ((duration - remaining) / duration) * 100;
  const isUrgent = remaining < duration * 0.2;
  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="terminal-accent rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-accent/40 text-xs tracking-widest">
          EPOCH #{currentEpoch.toString()}
        </div>
        <div className={`font-mono text-2xl font-bold tabular-nums tracking-wider ${isUrgent ? "text-dead text-glow" : "text-accent text-glow-dim"}`}>
          {mm}:{ss}
          <span className="animate-blink text-accent/60">_</span>
        </div>
      </div>
      <div className="h-0.5 bg-accent/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-dead progress-glow" : "bg-accent/50"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
