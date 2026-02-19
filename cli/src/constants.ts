// Last AI Standing — Contract Constants

export const BASE_RPC = process.env.RPC_URL || "https://base-rpc.publicnode.com";

export const CONTRACTS = {
  /** LastAIStanding contract (Base mainnet) */
  LAS: "0x5e9e09b03d08017fddbc1652e9394e7cb4a24074" as const,
  /** USDC on Base */
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  /** ERC-8004 Identity Registry on Base */
  IDENTITY: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
};

// ─── LastAIStanding ABI ──────────────────────────────────────────────
export const LAS_ABI = [
  // Views
  { type: "function", name: "COST_PER_EPOCH", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "EPOCH_DURATION", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "currentEpoch", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalAlive", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "totalDead", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "totalEverRegistered", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "totalAge", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalRewardsDistributed", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalPool", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "registryLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getAge", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "isAlive", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "isKillable", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "pendingReward", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "agentIdToAddr", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  {
    type: "function", name: "agents", inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "birthEpoch", type: "uint64" },
      { name: "lastHeartbeatEpoch", type: "uint64" },
      { name: "alive", type: "bool" },
      { name: "totalPaid", type: "uint96" },
      { name: "rewardDebt", type: "uint256" },
      { name: "claimable", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "getAgentList",
    inputs: [{ name: "startIndex", type: "uint256" }, { name: "endIndex", type: "uint256" }],
    outputs: [{
      type: "tuple[]", components: [
        { name: "addr", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "birthEpoch", type: "uint64" },
        { name: "lastHeartbeatEpoch", type: "uint64" },
        { name: "alive", type: "bool" },
        { name: "killable", type: "bool" },
        { name: "age", type: "uint256" },
        { name: "totalPaid", type: "uint256" },
        { name: "pendingReward", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getKillable",
    inputs: [{ name: "startIndex", type: "uint256" }, { name: "endIndex", type: "uint256" }],
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
  },
  // Actions
  { type: "function", name: "register", inputs: [{ name: "agentId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "heartbeat", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "kill", inputs: [{ name: "target", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const;

// ─── ERC-8004 Identity Registry ABI (subset) ────────────────────────
export const IDENTITY_ABI = [
  { type: "function", name: "getAgentWallet", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "getAgentId", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "register", inputs: [{ name: "metadataURI", type: "string" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

// ─── ERC-20 ABI (subset) ────────────────────────────────────────────
export const ERC20_ABI = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

// ─── Uniswap V3 (Base) ──────────────────────────────────────────────
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
