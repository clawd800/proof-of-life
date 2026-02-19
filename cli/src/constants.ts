// Last AI Standing — CLI Constants
// Shared constants (addresses, ABIs, RPCs) come from ./shared/
// This file re-exports shared + adds CLI-only constants (Uniswap)

// ─── Re-export shared constants ──────────────────────────────────────

export { CONTRACTS } from "./shared/addresses.js";
export { LAS_ABI, IDENTITY_ABI, ERC20_ABI } from "./shared/abis.js";
export { BASE_RPC_ENDPOINTS } from "./shared/rpcs.js";

// ─── Uniswap V3 (Base) — CLI only ───────────────────────────────────

export const UNISWAP = {
  SWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481" as const,
  QUOTER_V2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const,
  WETH: "0x4200000000000000000000000000000000000006" as const,
  FEE: 500, // 0.05% tier (ETH/USDC main pool)
};

export const QUOTER_ABI = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{
    name: "params", type: "tuple", components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" },
    { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

export const SWAP_ROUTER_ABI = [
  {
    type: "function", name: "exactInputSingle", stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple", components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "recipient", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "amountOutMinimum", type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function", name: "multicall", stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    type: "function", name: "unwrapWETH9", stateMutability: "payable",
    inputs: [{ name: "amountMinimum", type: "uint256" }, { name: "recipient", type: "address" }],
    outputs: [],
  },
] as const;
