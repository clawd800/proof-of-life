import { useGameState } from "@/hooks/useGameState";
import { useAgentList, type AgentInfo } from "@/hooks/useAgentList";
import { useActions } from "@/hooks/useActions";
import { shortAddr, fmtUsdc, fmtAge } from "@/config/utils";
import { useAccount } from "wagmi";

function StatusBadge({ agent }: { agent: AgentInfo }) {
  if (agent.killable) return <span className="text-orange-400 font-semibold">⚠️ Killable</span>;
  if (agent.alive) return <span className="text-emerald-400">🟢 Alive</span>;
  return <span className="text-zinc-500">💀 Dead</span>;
}

function AgentRow({ agent, epochDuration, isMe }: { agent: AgentInfo; epochDuration: bigint; isMe: boolean }) {
  const actions = useActions();

  return (
    <tr className={`border-b border-zinc-800/50 ${isMe ? "bg-zinc-800/30" : ""} hover:bg-zinc-800/20`}>
      <td className="py-3 px-3 font-mono text-sm">
        <a
          href={`https://basescan.org/address/${agent.addr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-red-400 transition-colors"
        >
          {shortAddr(agent.addr)}
        </a>
        {isMe && <span className="ml-2 text-xs text-red-400">(you)</span>}
      </td>
      <td className="py-3 px-3"><StatusBadge agent={agent} /></td>
      <td className="py-3 px-3 font-mono text-sm">{fmtAge(agent.age, epochDuration)}</td>
      <td className="py-3 px-3 font-mono text-sm">{fmtUsdc(agent.totalPaid)}</td>
      <td className="py-3 px-3 font-mono text-sm">{fmtUsdc(agent.pendingReward)}</td>
      <td className="py-3 px-3">
        {agent.killable && (
          <button
            onClick={() => actions.kill(agent.addr)}
            disabled={actions.isPending}
            className="px-3 py-1 bg-red-600/80 hover:bg-red-500 rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            💀 Kill
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
    return <div className="text-zinc-500 text-center py-8">Loading agents…</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-400 text-lg">No agents registered yet.</p>
        <p className="text-zinc-500 text-sm mt-1">Be the first to enter the arena.</p>
      </div>
    );
  }

  const ed = epochDuration ?? 600n;

  // Sort: alive first (by age desc), then killable, then dead (by age desc)
  const sorted = [...agents].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.killable !== b.killable) return a.killable ? -1 : 1;
    return Number(b.age - a.age);
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-xs uppercase tracking-wider">
              <th className="py-3 px-3">Agent</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Age</th>
              <th className="py-3 px-3">Paid</th>
              <th className="py-3 px-3">Rewards</th>
              <th className="py-3 px-3"></th>
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
