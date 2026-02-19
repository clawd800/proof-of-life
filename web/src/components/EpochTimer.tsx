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

  const ed = Number(epochDuration);
  const epochEnd = (Number(currentEpoch) + 1) * ed;
  const remaining = Math.max(0, epochEnd - now);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((ed - remaining) / ed) * 100;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">
          Epoch #{currentEpoch.toString()}
        </span>
        <span className="font-mono text-sm font-bold tabular-nums">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
