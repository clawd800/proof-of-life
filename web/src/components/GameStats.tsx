import { useGameState } from "@/hooks/useGameState";
import { fmtUsdc, fmtDuration } from "@/config/utils";

function Stat({ label, value, glow }: { label: string; value: string; glow?: boolean }) {
  return (
    <div className="terminal rounded p-3">
      <div className="text-[10px] text-accent/30 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-base font-bold font-mono tabular-nums ${glow ? "text-accent text-glow-dim" : "text-accent/80"}`}>
        {value}
      </div>
    </div>
  );
}

export function GameStats() {
  const {
    totalAlive, totalDead, totalPool, totalRewardsDistributed,
    epochDuration, costPerEpoch, isLoading,
  } = useGameState();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="terminal rounded p-3 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  const epochSecs = epochDuration ? Number(epochDuration) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      <Stat label="Alive" value={totalAlive?.toString() ?? "—"} glow />
      <Stat label="Dead" value={totalDead?.toString() ?? "—"} />
      <Stat label="Pool" value={fmtUsdc(totalPool, true)} glow />
      <Stat label="Distributed" value={fmtUsdc(totalRewardsDistributed, true)} />
      <Stat label="Epoch" value={epochSecs ? fmtDuration(epochSecs) : "—"} />
      <Stat label="Cost" value={fmtUsdc(costPerEpoch, true)} />
    </div>
  );
}
