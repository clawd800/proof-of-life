import { useAccount, useReadContracts } from "wagmi";
import { LAS_ADDRESS, LAS_ABI, USDC_ADDRESS, ERC20_ABI } from "@/config/contracts";

export function usePlayerState() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          { address: LAS_ADDRESS, abi: LAS_ABI, functionName: "isAlive", args: [address] },
          { address: LAS_ADDRESS, abi: LAS_ABI, functionName: "isKillable", args: [address] },
          { address: LAS_ADDRESS, abi: LAS_ABI, functionName: "getAge", args: [address] },
          { address: LAS_ADDRESS, abi: LAS_ABI, functionName: "pendingReward", args: [address] },
          { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [address] },
          { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: [address, LAS_ADDRESS] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const get = (i: number) => data?.[i]?.result;

  return {
    isAlive: get(0) as boolean | undefined,
    isKillable: get(1) as boolean | undefined,
    age: get(2) as bigint | undefined,
    pendingReward: get(3) as bigint | undefined,
    usdcBalance: get(4) as bigint | undefined,
    usdcAllowance: get(5) as bigint | undefined,
    isLoading,
    refetch,
  };
}
