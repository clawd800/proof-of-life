import { useGameState } from "@/hooks/useGameState";
import { fmtUsdc } from "@/config/utils";

function Stat({ label, value, colorClass, glowClass, hasConnector }: { label: string; value: string; colorClass?: string; glowClass?: string; hasConnector?: boolean }) {
  return (
    <div className="terminal rounded py-4 px-5 relative group">
      <div className="text-[10px] text-accent/50 uppercase tracking-[0.2em] mb-1.5 font-bold">{label}</div>
      <div className={`text-xl md:text-2xl font-bold font-mono tabular-nums ${colorClass || "text-accent/90"} ${glowClass || ""}`}>
        {value}
      </div>
      {hasConnector && (
        <>
          <div className="hidden md:block absolute top-[55%] -right-4 w-4 h-[1px] bg-accent/20 z-0 pointer-events-none" />
          <div className="hidden md:block absolute top-[55%] -right-4 w-[3px] h-[3px] rounded-full bg-accent/40 -translate-y-[1px] z-10 pointer-events-none" />
        </>
      )}
    </div>
  );
}

export function GameStats() {
  const {
    totalAlive, totalDead, totalPool, totalRewardsDistributed,
    isLoading,
  } = useGameState();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="terminal rounded py-4 px-5 h-[80px] md:h-[88px] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <Stat label="Alive" value={totalAlive?.toString() ?? "—"} colorClass="text-alive" glowClass="text-glow" />
      <Stat label="Dead" value={totalDead?.toString() ?? "—"} colorClass="text-dead" glowClass="text-glow" hasConnector />
      <Stat label="Pool" value={fmtUsdc(totalPool, true)} colorClass="text-killable" glowClass="text-glow" hasConnector />
      <Stat label="Distributed" value={fmtUsdc(totalRewardsDistributed, true)} colorClass="text-accent/90" glowClass="text-glow-dim" />
    </div>
  );
}
