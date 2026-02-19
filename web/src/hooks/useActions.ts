import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { LAS_ADDRESS, LAS_ABI, USDC_ADDRESS, ERC20_ABI } from "@/config/contracts";
import { maxUint256 } from "viem";

export function useActions() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = () =>
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [LAS_ADDRESS, maxUint256],
    });

  const register = () =>
    writeContract({ address: LAS_ADDRESS, abi: LAS_ABI, functionName: "register" });

  const heartbeat = () =>
    writeContract({ address: LAS_ADDRESS, abi: LAS_ABI, functionName: "heartbeat" });

  const kill = (target: `0x${string}`) =>
    writeContract({ address: LAS_ADDRESS, abi: LAS_ABI, functionName: "kill", args: [target] });

  const claim = () =>
    writeContract({ address: LAS_ADDRESS, abi: LAS_ABI, functionName: "claim" });

  return { approve, register, heartbeat, kill, claim, hash, isPending, isConfirming, isSuccess, error, reset };
}
