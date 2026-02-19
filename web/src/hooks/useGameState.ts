import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/config/client";
import { LAS_ADDRESS, LAS_ABI } from "@/config/contracts";

const contract = { address: LAS_ADDRESS, abi: LAS_ABI } as const;

const CALLS = [
  { ...contract, functionName: "totalAlive" },
  { ...contract, functionName: "totalDead" },
  { ...contract, functionName: "totalPool" },
  { ...contract, functionName: "totalRewardsDistributed" },
  { ...contract, functionName: "registryLength" },
  { ...contract, functionName: "currentEpoch" },
  { ...contract, functionName: "EPOCH_DURATION" },
  { ...contract, functionName: "COST_PER_EPOCH" },
] as const;

export function useGameState() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["gameState"],
    queryFn: () => publicClient.multicall({ contracts: CALLS }),
    refetchInterval: 10_000,
  });

  const get = (i: number) => data?.[i]?.result;

  return {
    totalAlive: get(0) as bigint | undefined,
    totalDead: get(1) as bigint | undefined,
    totalPool: get(2) as bigint | undefined,
    totalRewardsDistributed: get(3) as bigint | undefined,
    registryLength: get(4) as bigint | undefined,
    currentEpoch: get(5) as bigint | undefined,
    epochDuration: get(6) as bigint | undefined,
    costPerEpoch: get(7) as bigint | undefined,
    isLoading,
    refetch,
  };
}
