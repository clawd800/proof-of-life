import { useState, useEffect } from "react";
import { useGameState } from "@/hooks/useGameState";
import { Icon } from "./Icons";

export function EpochTimer() {
  const { currentEpoch, epochDuration } = useGameState();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!currentEpoch || !epochDuration) return null;

  const ed = Number(epochDuration);
  const epochEnd = (Number(currentEpoch) + 1) * ed;
  const remaining = Math.max(0, epochEnd - now);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((ed - remaining) / ed) * 100;
  const isUrgent = remaining < ed * 0.2;

  return (
    <div className="glass-accent rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-zinc-400">
          {Icon.Timer({ className: `w-4 h-4 ${isUrgent ? "text-accent" : ""}` })}
          <span className="text-xs uppercase tracking-widest font-medium">
            Epoch #{currentEpoch.toString()}
          </span>
        </div>
        <div className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${isUrgent ? "text-accent text-glow" : "text-white"}`}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-accent progress-glow" : "bg-accent/60"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
