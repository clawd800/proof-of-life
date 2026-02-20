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
    <span className={`inline-flex items-center gap-2 text-xs ${s.color} ${s.bold ? "font-bold tracking-widest" : "font-medium tracking-wider"}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} shadow-[0_0_8px_currentColor]`} />
      {s.label}
    </span>
  );
}

function AgentAvatar({ src, name }: { src: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="w-12 h-12 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center text-sm text-accent/40 shrink-0">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="w-12 h-12 rounded-full object-cover border border-accent/15 shrink-0"
    />
  );
}

function AgentIdentity({ agent, profile }: { agent: AgentInfo; profile?: AgentProfile }) {
  const addrEl = (
    <span className="font-mono text-[11px] text-accent/40">{shortAddr(agent.addr)}</span>
  );

  const tagEl = agent.agentId > 0n ? (
    <span className="px-1.5 py-0.5 rounded bg-accent/10 text-[10px] font-mono text-accent/70 border border-accent/20 flex-shrink-0">
      #{agent.agentId.toString()}
    </span>
  ) : null;

  if (!profile) {
    return (
      <a
        href={`https://basescan.org/address/${agent.addr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-3 hover:text-accent transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-accent/5 border border-accent/10 shrink-0 flex items-center justify-center">
          <span className="text-accent/20 text-xs">?</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-accent/60 font-medium">Unknown</span>
            {tagEl}
          </div>
          {addrEl}
        </div>
      </a>
    );
  }

  return (
    <a
      href={profile.scanUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 group/agent hover:text-accent transition-colors min-w-0"
    >
      {profile.image ? (
        <AgentAvatar src={profile.image} name={profile.name} />
      ) : (
        <span className="w-12 h-12 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center text-sm text-accent/40 shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex flex-col gap-0.5 justify-center">
        <span className="flex items-center gap-2">
          <span className="text-sm text-accent/80 group-hover/agent:text-accent transition-colors truncate font-medium">
            {profile.name}
          </span>
          {tagEl}
        </span>
        <span className="font-mono text-[10px] text-accent/30">{shortAddr(agent.addr)}</span>
      </span>
    </a>
  );
}

const COLUMNS = ["AGENT", "STATUS", "SURVIVED", "AGE", "REWARDS"] as const;

function AgentRow({ agent, epochDuration, profile }: { agent: AgentInfo; epochDuration: bigint; profile?: AgentProfile }) {
  const totalRewards = agent.totalClaimed + agent.pendingReward;

  return (
    <tr className="border-b border-accent/10 matrix-row transition-colors group">
      <td className="py-2.5 px-5">
        <AgentIdentity agent={agent} profile={profile} />
      </td>
      <td className="py-2.5 px-5"><StatusBadge agent={agent} /></td>
      <td className="py-2.5 px-5 font-mono text-xs text-accent/70">
        {agent.age.toString()}
      </td>
      <td className="py-2.5 px-5 font-mono text-xs text-accent/70">
        {fmtAge(agent.age, epochDuration)}
      </td>
      <td className="py-2.5 px-5 font-mono text-xs text-alive font-semibold">
        <span className="text-alive/50 mr-0.5">+$</span>{fmtUsdc(totalRewards)}
      </td>
    </tr>
  );
}

export function AgentTable({ showActiveOnly }: { showActiveOnly?: boolean }) {
  const { registryLength, epochDuration, isLoading: stateLoading } = useGameState();
  const { agents, isLoading: listLoading } = useAgentList(registryLength);

  // Build addr→agentId map for profile lookup (skips tokenOfOwnerByIndex call)
  const agentIdMap = new Map(
    agents.filter((a) => a.agentId > 0n).map((a) => [a.addr, a.agentId])
  );
  const { data: profiles } = useAgentProfiles(agentIdMap);

  if (stateLoading || listLoading) {
    return (
      <div className="terminal rounded p-12 text-center">
        <div className="text-accent/30 text-sm font-mono animate-pulse tracking-widest">LOADING ARENA DATA...</div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="terminal rounded p-16 text-center">
        <div className="text-accent/20 text-4xl mb-4 font-mono">[ ]</div>
        <p className="text-accent/50 text-sm tracking-widest font-bold">NO AGENTS IN THE ARENA</p>
        <p className="text-accent/30 text-xs mt-2">Be the first to register</p>
      </div>
    );
  }

  const ed = epochDuration ?? 600n;

  const filteredAgents = showActiveOnly
    ? agents.filter((a) => a.alive || a.killable)
    : agents;

  const sorted = [...filteredAgents].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.killable !== b.killable) return a.killable ? -1 : 1;
    return Number(b.age - a.age);
  });

  if (filteredAgents.length === 0 && agents.length > 0) {
    return (
      <div className="terminal rounded p-16 text-center">
        <div className="text-accent/20 text-4xl mb-4 font-mono">[ ]</div>
        <p className="text-accent/50 text-sm tracking-widest font-bold">NO ACTIVE AGENTS</p>
      </div>
    );
  }

  return (
    <div className="terminal rounded overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-accent/15 bg-surface-raised/20">
              {COLUMNS.map((h) => (
                <th key={h} className="py-3 px-5 text-[10px] text-accent/50 uppercase tracking-[0.25em] font-bold">
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
