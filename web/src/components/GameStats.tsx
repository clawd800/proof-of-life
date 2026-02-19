import { useGameState } from "@/hooks/useGameState";
import { fmtUsdc, fmtDuration } from "@/config/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}

export function GameStats() {
  const {
    totalAlive, totalDead, totalPool, totalRewardsDistributed,
    epochDuration, costPerEpoch, isLoading,
  } = useGameState();

  if (isLoading) {
    return <div className="text-zinc-500 text-center py-8">Loading game state…</div>;
  }

  const epochSecs = epochDuration ? Number(epochDuration) : 0;
  const costStr = costPerEpoch ? `${fmtUsdc(costPerEpoch)} USDC` : "—";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="🟢 Alive" value={totalAlive?.toString() ?? "—"} />
      <Stat label="💀 Dead" value={totalDead?.toString() ?? "—"} />
      <Stat label="💰 Pool" value={totalPool !== undefined ? `${fmtUsdc(totalPool)} USDC` : "—"} />
      <Stat label="🏆 Distributed" value={totalRewardsDistributed !== undefined ? `${fmtUsdc(totalRewardsDistributed)} USDC` : "—"} />
      <Stat label="⏱ Epoch" value={epochSecs ? fmtDuration(epochSecs) : "—"} />
      <Stat label="💸 Cost / Epoch" value={costStr} />
    </div>
  );
}
