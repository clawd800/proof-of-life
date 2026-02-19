import { useAccount } from "wagmi";
import { usePlayerState } from "@/hooks/usePlayerState";
import { useGameState } from "@/hooks/useGameState";
import { useActions } from "@/hooks/useActions";
import { fmtUsdc, fmtAge } from "@/config/utils";
import { TxStatus } from "./TxStatus";

export function PlayerPanel() {
  const { address, isConnected } = useAccount();
  const player = usePlayerState();
  const game = useGameState();
  const actions = useActions();

  if (!isConnected || !address) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <p className="text-zinc-400">Connect your wallet to enter the arena</p>
      </div>
    );
  }

  const needsApproval =
    player.usdcAllowance !== undefined &&
    game.costPerEpoch !== undefined &&
    player.usdcAllowance < game.costPerEpoch;

  const isRegistered = player.age !== undefined && player.age > 0n;
  const isDead = isRegistered && !player.isAlive;
  const canClaim = player.pendingReward !== undefined && player.pendingReward > 0n;
  const epochDuration = game.epochDuration ?? 600n;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        {player.isAlive ? "🟢" : isDead ? "💀" : "👤"} Your Agent
      </h2>

      {/* Status row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-zinc-500">Status</span>
          <p className="font-semibold">
            {player.isAlive ? "Alive" : isDead ? "Dead" : "Not Registered"}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">Age</span>
          <p className="font-mono">{player.age ? fmtAge(player.age, epochDuration) : "—"}</p>
        </div>
        <div>
          <span className="text-zinc-500">Rewards</span>
          <p className="font-mono">{fmtUsdc(player.pendingReward)} USDC</p>
        </div>
        <div>
          <span className="text-zinc-500">USDC Balance</span>
          <p className="font-mono">{fmtUsdc(player.usdcBalance)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2">
        {needsApproval ? (
          <ActionButton onClick={actions.approve} disabled={actions.isPending} label="Approve USDC" />
        ) : (
          <>
            {!isRegistered || isDead ? (
              <ActionButton onClick={actions.register} disabled={actions.isPending} label="⚔️ Register" variant="primary" />
            ) : null}
            {player.isAlive && (
              <ActionButton onClick={actions.heartbeat} disabled={actions.isPending} label="💓 Heartbeat" variant="primary" />
            )}
            {canClaim && (
              <ActionButton onClick={actions.claim} disabled={actions.isPending} label="💰 Claim" variant="success" />
            )}
          </>
        )}
      </div>

      <TxStatus
        hash={actions.hash}
        isPending={actions.isPending}
        isConfirming={actions.isConfirming}
        isSuccess={actions.isSuccess}
        error={actions.error}
        onDone={() => {
          actions.reset();
          player.refetch();
          game.refetch();
        }}
      />
    </div>
  );
}

function ActionButton({
  onClick, disabled, label, variant = "default",
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  variant?: "default" | "primary" | "success";
}) {
  const styles = {
    default: "bg-zinc-700 hover:bg-zinc-600",
    primary: "bg-red-600 hover:bg-red-500",
    success: "bg-emerald-600 hover:bg-emerald-500",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
