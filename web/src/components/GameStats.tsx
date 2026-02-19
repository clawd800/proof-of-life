import { useGameState } from "@/hooks/useGameState";
import { fmtUsdc, fmtDuration } from "@/config/utils";
import { Icon } from "./Icons";
import type { ReactNode } from "react";

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-4 flex items-start gap-3">
      <div className="text-accent/60 mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">{label}</div>
        <div className="text-lg font-bold font-mono text-white truncate">{value}</div>
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  const epochSecs = epochDuration ? Number(epochDuration) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat icon={Icon.Shield({ className: "w-5 h-5" })} label="Alive" value={totalAlive?.toString() ?? "—"} />
      <Stat icon={Icon.Skull({ className: "w-5 h-5" })} label="Dead" value={totalDead?.toString() ?? "—"} />
      <Stat icon={Icon.Token({ className: "w-5 h-5" })} label="Pool" value={totalPool !== undefined ? `${fmtUsdc(totalPool)}` : "—"} />
      <Stat icon={Icon.Trophy({ className: "w-5 h-5" })} label="Distributed" value={totalRewardsDistributed !== undefined ? `${fmtUsdc(totalRewardsDistributed)}` : "—"} />
      <Stat icon={Icon.Timer({ className: "w-5 h-5" })} label="Epoch" value={epochSecs ? fmtDuration(epochSecs) : "—"} />
      <Stat icon={Icon.Bolt({ className: "w-5 h-5" })} label="Cost" value={costPerEpoch ? `${fmtUsdc(costPerEpoch)} USDC` : "—"} />
    </div>
  );
}
