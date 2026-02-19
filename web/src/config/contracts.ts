export const LAS_ADDRESS = "0x6990872508850490eA36F3492444Dc517cA9359d" as const;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

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
  {
    type: "function", name: "getAgentList",
    inputs: [{ name: "startIndex", type: "uint256" }, { name: "endIndex", type: "uint256" }],
    outputs: [{
      type: "tuple[]", components: [
        { name: "addr", type: "address" },
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
  // Actions
  { type: "function", name: "register", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "heartbeat", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "kill", inputs: [{ name: "target", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [], outputs: [], stateMutability: "nonpayable" },
  // Events
  { type: "event", name: "Born", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "epoch", type: "uint256" }] },
  { type: "event", name: "Heartbeat", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "epoch", type: "uint256" }, { name: "age", type: "uint256" }] },
  { type: "event", name: "Death", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "epoch", type: "uint256" }, { name: "age", type: "uint256" }, { name: "totalPaid", type: "uint256" }] },
  { type: "event", name: "Claimed", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  // Errors
  { type: "error", name: "AlreadyRegistered", inputs: [] },
  { type: "error", name: "NotRegistered", inputs: [] },
  { type: "error", name: "AlreadyDead", inputs: [] },
  { type: "error", name: "AlreadyHeartbeat", inputs: [] },
  { type: "error", name: "MissedEpoch", inputs: [] },
  { type: "error", name: "NotDeadYet", inputs: [] },
  { type: "error", name: "NothingToClaim", inputs: [] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;
