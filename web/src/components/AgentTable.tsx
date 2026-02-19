import { useState } from "react";
import { useGameState } from "@/hooks/useGameState";
import { useAgentList, type AgentInfo } from "@/hooks/useAgentList";
import { useAgentProfiles, type AgentProfile } from "@/hooks/useAgentProfiles";
import { shortAddr, fmtUsdc, fmtAge } from "@/config/utils";

const STATUS = {
  killable: { color: "text-killable", dot: "bg-killable animate-pulse", label: "KILLABLE", bold: true },
  alive:    { color: "text-alive",    dot: "bg-alive",                  label: "ALIVE",    bold: false },
  dead:     { color: "text-dead/60",  dot: "bg-dead/30",               label: "DEAD",     bold: false },
} as const;

type Status = keyof typeof STATUS;

function getStatus(agent: AgentInfo): Status {
  if (agent.killable) return "killable";
  return agent.alive ? "alive" : "dead";
}

function StatusBadge({ agent }: { agent: AgentInfo }) {
  const s = STATUS[getStatus(agent)];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${s.color} ${s.bold ? "font-bold tracking-wider" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function AgentAvatar({ src, name }: { src: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center text-[9px] text-accent/40 shrink-0">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="w-6 h-6 rounded-full object-cover border border-accent/15 shrink-0"
    />
  );
}

function AgentIdentity({ agent, profile }: { agent: AgentInfo; profile?: AgentProfile }) {
  const addrEl = (
    <span className="font-mono text-[11px] text-accent/40">{shortAddr(agent.addr)}</span>
  );

  if (!profile) {
    return (
      <a
        href={`https://basescan.org/address/${agent.addr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-accent/5 border border-accent/10 shrink-0" />
        {addrEl}
      </a>
    );
  }

  return (
    <a
      href={profile.scanUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 group/agent hover:text-accent transition-colors min-w-0"
    >
      {profile.image ? (
        <AgentAvatar src={profile.image} name={profile.name} />
      ) : (
        <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center text-[9px] text-accent/40 shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex flex-col">
        <span className="text-[11px] text-accent/80 group-hover/agent:text-accent transition-colors truncate font-medium">
          {profile.name}
        </span>
        <span className="font-mono text-[9px] text-accent/30">{shortAddr(agent.addr)}</span>
      </span>
    </a>
  );
}

const COLUMNS = ["AGENT", "STATUS", "AGE", "PAID", "REWARDS"] as const;

function AgentRow({ agent, epochDuration, profile }: { agent: AgentInfo; epochDuration: bigint; profile?: AgentProfile }) {
  return (
    <tr className="border-b border-accent/5 matrix-row transition-colors">
      <td className="py-2.5 px-3">
        <AgentIdentity agent={agent} profile={profile} />
      </td>
      <td className="py-2.5 px-3"><StatusBadge agent={agent} /></td>
      <td className="py-2.5 px-3 font-mono text-[11px] text-accent/60">{fmtAge(agent.age, epochDuration)}</td>
      <td className="py-2.5 px-3 font-mono text-[11px] text-accent/40">{fmtUsdc(agent.totalPaid)}</td>
      <td className="py-2.5 px-3 font-mono text-[11px] text-accent/60">{fmtUsdc(agent.pendingReward)}</td>
    </tr>
  );
}

export function AgentTable() {
  const { registryLength, epochDuration, isLoading: stateLoading } = useGameState();
  const { agents, isLoading: listLoading } = useAgentList(registryLength);

  // Build addr→agentId map for profile lookup (skips tokenOfOwnerByIndex call)
  const agentIdMap = new Map(
    agents.filter((a) => a.alive && a.agentId > 0n).map((a) => [a.addr, a.agentId])
  );
  const { data: profiles } = useAgentProfiles(agentIdMap);

  if (stateLoading || listLoading) {
    return (
      <div className="terminal rounded p-6">
        <div className="text-accent/20 text-xs font-mono animate-pulse">Loading arena data...</div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="terminal rounded p-10 text-center">
        <div className="text-accent/10 text-3xl mb-3 font-mono">[ ]</div>
        <p className="text-accent/30 text-xs">NO AGENTS IN THE ARENA</p>
        <p className="text-accent/15 text-[10px] mt-1">Be the first to register</p>
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
    <div className="terminal rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-accent/10">
              {COLUMNS.map((h) => (
                <th key={h} className="py-2.5 px-3 text-[9px] text-accent/25 uppercase tracking-[0.2em] font-normal">
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
                profile={profiles?.get(agent.addr.toLowerCase())}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
