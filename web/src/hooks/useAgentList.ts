import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/config/client";
import { CONTRACTS, LAS_ABI } from "@/config/contracts";

export interface AgentInfo {
  addr: `0x${string}`;
  agentId: bigint;
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agentList", registryLength?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: CONTRACTS.LAS,
        abi: LAS_ABI,
        functionName: "getAgentList",
        args: [0n, registryLength! - 1n],
      }),
    enabled: hasAgents,
    refetchInterval: 10_000,
  });

  return {
    agents: (data as AgentInfo[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}
