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
    queryFn: async () => {
      const total = registryLength!;
      if (total === 0n) return [];

      const batchSize = 100n;
      const promises = [];

      for (let i = 0n; i < total; i += batchSize) {
        const start = i;
        const end = start + batchSize - 1n < total - 1n ? start + batchSize - 1n : total - 1n;
        promises.push(
          publicClient.readContract({
            address: CONTRACTS.LAS,
            abi: LAS_ABI,
            functionName: "getAgentList",
            args: [start, end],
          })
        );
      }

      const results = await Promise.all(promises);
      return results.flat() as AgentInfo[];
    },
    enabled: hasAgents,
    refetchInterval: 10_000,
  });

  return {
    agents: (data as AgentInfo[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}
