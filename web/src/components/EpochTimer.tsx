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
  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="terminal-accent rounded py-4 px-5 md:py-5 md:px-8 relative overflow-hidden group">
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(109,245,216,0.03)_0%,transparent_70%)] pointer-events-none transition-opacity duration-1000"
        style={{ opacity: isUrgent ? 0 : 1 }}
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,106,140,0.05)_0%,transparent_70%)] pointer-events-none transition-opacity duration-1000"
        style={{ opacity: isUrgent ? 1 : 0 }}
      />

      <div className="relative z-10 flex items-center justify-between gap-4 mb-4 md:mb-5">
        <div className="text-accent/60 text-[10px] md:text-[11px] tracking-[0.3em] md:tracking-[0.4em] font-bold">
          EPOCH #{currentEpoch.toString()}
        </div>
        <div
          className={`font-mono text-3xl md:text-4xl font-bold tabular-nums tracking-wider ${isUrgent ? "text-dead text-glow" : "text-alive text-glow"}`}
        >
          {mm}:{ss}
          <span className="animate-blink text-accent/40 ml-1">_</span>
        </div>
      </div>
      <div className="relative z-10 h-1 bg-accent/10 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-dead shadow-[0_0_15px_rgba(255,106,140,0.8)]" : "bg-alive shadow-[0_0_15px_rgba(109,245,216,0.6)]"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
