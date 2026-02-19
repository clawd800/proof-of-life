import { useGameState } from "@/hooks/useGameState";
import { useAgentList, type AgentInfo } from "@/hooks/useAgentList";
import { useActions } from "@/hooks/useActions";
import { shortAddr, fmtUsdc, fmtAge } from "@/config/utils";
import { useAccount } from "wagmi";
import { Icon } from "./Icons";

function StatusBadge({ agent }: { agent: AgentInfo }) {
  if (agent.killable) {
    return (
      <span className="inline-flex items-center gap-1.5 text-killable text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-killable animate-pulse" />
        Killable
      </span>
    );
  }
  if (agent.alive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-alive text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-alive" />
        Alive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-dead text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-dead/50" />
      Dead
    </span>
  );
}

function AgentRow({ agent, epochDuration, isMe }: { agent: AgentInfo; epochDuration: bigint; isMe: boolean }) {
  const actions = useActions();

  return (
    <tr className={`border-b border-white/[0.03] transition-colors ${isMe ? "bg-accent/[0.04]" : "hover:bg-white/[0.02]"}`}>
      <td className="py-3 px-4">
        <a
          href={`https://basescan.org/address/${agent.addr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-zinc-400 hover:text-accent transition-colors"
        >
          {shortAddr(agent.addr)}
        </a>
        {isMe && <span className="ml-2 text-[10px] text-accent font-semibold uppercase tracking-wider">you</span>}
      </td>
      <td className="py-3 px-4"><StatusBadge agent={agent} /></td>
      <td className="py-3 px-4 font-mono text-xs text-zinc-300">{fmtAge(agent.age, epochDuration)}</td>
      <td className="py-3 px-4 font-mono text-xs text-zinc-400">{fmtUsdc(agent.totalPaid)}</td>
      <td className="py-3 px-4 font-mono text-xs text-zinc-300">{fmtUsdc(agent.pendingReward)}</td>
      <td className="py-3 px-4 text-right">
        {agent.killable && (
          <button
            onClick={() => actions.kill(agent.addr)}
            disabled={actions.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-all disabled:opacity-30 cursor-pointer"
          >
            {Icon.Skull({ className: "w-3.5 h-3.5" })} Kill
          </button>
        )}
      </td>
    </tr>
  );
}

export function AgentTable() {
  const { address } = useAccount();
  const { registryLength, epochDuration, isLoading: stateLoading } = useGameState();
  const { agents, isLoading: listLoading } = useAgentList(registryLength);

  if (stateLoading || listLoading) {
    return (
      <div className="glass rounded-xl p-8">
        <div className="h-40 animate-pulse bg-white/[0.02] rounded-lg" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="glass rounded-xl p-12 text-center">
        <div className="text-zinc-700 mb-3">{Icon.Swords({ className: "w-12 h-12 mx-auto" })}</div>
        <p className="text-zinc-500 text-sm">No agents in the arena yet</p>
        <p className="text-zinc-600 text-xs mt-1">Be the first to register</p>
      </div>
    );
  }

  const ed = epochDuration ?? 600n;

  const sorted = [...agents].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.killable !== b.killable) return a.killable ? -1 : 1;
    return Number(b.age - a.age);
  });

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Agent", "Status", "Age", "Paid", "Rewards", ""].map((h) => (
                <th key={h} className="py-3 px-4 text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent) => (
              <AgentRow
                key={agent.addr}
                agent={agent}
                epochDuration={ed}
                isMe={address?.toLowerCase() === agent.addr.toLowerCase()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
