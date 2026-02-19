import { useAccount } from "wagmi";
import { usePlayerState } from "@/hooks/usePlayerState";
import { useGameState } from "@/hooks/useGameState";
import { useActions } from "@/hooks/useActions";
import { fmtUsdc, fmtAge } from "@/config/utils";
import { Icon } from "./Icons";
import { TxStatus } from "./TxStatus";

export function PlayerPanel() {
  const { address, isConnected } = useAccount();
  const player = usePlayerState();
  const game = useGameState();
  const actions = useActions();

  if (!isConnected || !address) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <div className="text-zinc-600 mb-3">{Icon.Person({ className: "w-10 h-10 mx-auto" })}</div>
        <p className="text-zinc-500 text-sm">Connect wallet to enter the arena</p>
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

  const statusColor = player.isAlive ? "text-alive" : isDead ? "text-dead" : "text-zinc-500";
  const statusText = player.isAlive ? "ALIVE" : isDead ? "DEAD" : "UNREGISTERED";

  return (
    <div className="glass-accent rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={statusColor}>
            {player.isAlive ? Icon.Shield({ className: "w-6 h-6" }) : isDead ? Icon.Skull({ className: "w-6 h-6" }) : Icon.Person({ className: "w-6 h-6" })}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Your Agent</h2>
            <span className={`text-xs font-mono font-bold uppercase tracking-wider ${statusColor}`}>{statusText}</span>
          </div>
        </div>
        {player.isAlive && (
          <span className="w-2.5 h-2.5 rounded-full bg-alive animate-pulse-dot" />
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Age" value={player.age ? fmtAge(player.age, epochDuration) : "—"} />
        <MiniStat label="Rewards" value={`${fmtUsdc(player.pendingReward)} USDC`} accent={canClaim} />
        <MiniStat label="Balance" value={`${fmtUsdc(player.usdcBalance)} USDC`} />
        <MiniStat label="Allowance" value={needsApproval ? "Need approval" : "✓"} warn={needsApproval} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5">
        {needsApproval ? (
          <ActionBtn onClick={actions.approve} disabled={actions.isPending} variant="default">
            Approve USDC
          </ActionBtn>
        ) : (
          <>
            {(!isRegistered || isDead) && (
              <ActionBtn onClick={actions.register} disabled={actions.isPending} variant="primary">
                {Icon.Swords({ className: "w-4 h-4" })} Register
              </ActionBtn>
            )}
            {player.isAlive && (
              <ActionBtn onClick={actions.heartbeat} disabled={actions.isPending} variant="primary">
                {Icon.Heart({ className: "w-4 h-4" })} Heartbeat
              </ActionBtn>
            )}
            {canClaim && (
              <ActionBtn onClick={actions.claim} disabled={actions.isPending} variant="success">
                {Icon.Token({ className: "w-4 h-4" })} Claim
              </ActionBtn>
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
        onDone={() => { actions.reset(); player.refetch(); game.refetch(); }}
      />
    </div>
  );
}

function MiniStat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-600 uppercase tracking-widest">{label}</div>
      <div className={`text-sm font-mono font-medium ${warn ? "text-killable" : accent ? "text-accent" : "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, disabled, variant, children }: {
  onClick: () => void;
  disabled: boolean;
  variant: "default" | "primary" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    default: "glass hover:bg-white/5 text-zinc-300",
    primary: "bg-accent/90 hover:bg-accent text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]",
    success: "bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.25)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
