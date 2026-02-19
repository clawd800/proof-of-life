import { useReadContract } from "wagmi";
import { LAS_ADDRESS, LAS_ABI } from "@/config/contracts";

export interface AgentInfo {
  addr: `0x${string}`;
  birthEpoch: bigint;
  lastHeartbeatEpoch: bigint;
  alive: boolean;
  killable: boolean;
  age: bigint;
  totalPaid: bigint;
  pendingReward: bigint;
}

export function useAgentList(registryLength: bigint | undefined) {
  const hasAgents = registryLength !== undefined && registryLength > 0n;

  const { data, isLoading, refetch } = useReadContract({
    address: LAS_ADDRESS,
    abi: LAS_ABI,
    functionName: "getAgentList",
    args: hasAgents ? [0n, registryLength - 1n] : undefined,
    query: {
      enabled: hasAgents,
      refetchInterval: 10_000,
    },
  });

  return {
    agents: (data as AgentInfo[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}
