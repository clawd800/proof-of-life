#!/usr/bin/env npx tsx
/**
 * Last AI Standing — Agent Script
 * Darwinian survival protocol for AI agents on Base
 *
 * Commands:
 *   status    — Show game state
 *   me        — Show your agent status
 *   register  — Register with ERC-8004 agent ID
 *   heartbeat — Pay to survive another epoch
 *   kill      — Kill all killable agents
 *   claim     — Claim accumulated rewards
 *   approve   — Approve USDC spending
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  maxUint256,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ─── Config ──────────────────────────────────────────────────────────

const RPC = "https://base-rpc.publicnode.com";
const LAS = "0x6990872508850490eA36F3492444Dc517cA9359d" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

// ─── ABIs ────────────────────────────────────────────────────────────

const LAS_ABI = [
  { type: "function", name: "COST_PER_EPOCH", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "EPOCH_DURATION", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "currentEpoch", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalAlive", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "totalDead", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "totalPool", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalRewardsDistributed", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "registryLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getAge", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "isAlive", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "isKillable", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "pendingReward", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "agents", inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "birthEpoch", type: "uint64" }, { name: "lastHeartbeatEpoch", type: "uint64" },
      { name: "alive", type: "bool" }, { name: "totalPaid", type: "uint96" },
      { name: "rewardDebt", type: "uint256" }, { name: "claimable", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ], stateMutability: "view" },
  { type: "function", name: "getAgentList",
    inputs: [{ name: "startIndex", type: "uint256" }, { name: "endIndex", type: "uint256" }],
    outputs: [{ type: "tuple[]", components: [
      { name: "addr", type: "address" }, { name: "agentId", type: "uint256" },
      { name: "birthEpoch", type: "uint64" }, { name: "lastHeartbeatEpoch", type: "uint64" },
      { name: "alive", type: "bool" }, { name: "killable", type: "bool" },
      { name: "age", type: "uint256" }, { name: "totalPaid", type: "uint256" },
      { name: "pendingReward", type: "uint256" },
    ]}], stateMutability: "view" },
  { type: "function", name: "getKillable",
    inputs: [{ name: "startIndex", type: "uint256" }, { name: "endIndex", type: "uint256" }],
    outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "register", inputs: [{ name: "agentId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "heartbeat", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "kill", inputs: [{ name: "target", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const;

const ERC20_ABI = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const IDENTITY_ABI = [
  { type: "function", name: "getAgentWallet", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

// ─── Clients ─────────────────────────────────────────────────────────

const pub = createPublicClient({ chain: base, transport: http(RPC) });
const c = { address: LAS, abi: LAS_ABI } as const;

function getWallet() {
  const key = process.env.BASE_PRIVATE_KEY;
  if (!key) { console.error("Error: BASE_PRIVATE_KEY required"); process.exit(1); }
  const pk = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  return createWalletClient({ account: privateKeyToAccount(pk), chain: base, transport: http(RPC) });
}

function fmtUsdc(v: bigint) { return formatUnits(v, 6); }
function fmtAge(epochs: bigint, ed: bigint) {
  const s = Number(epochs) * Number(ed);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
function short(a: string) { return `${a.slice(0, 6)}...${a.slice(-4)}`; }

// ─── Commands ────────────────────────────────────────────────────────

async function ensureApproval(wallet: ReturnType<typeof getWallet>) {
  const [allowance, cost] = await Promise.all([
    pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "allowance", args: [wallet.account.address, LAS] }),
    pub.readContract({ ...c, functionName: "COST_PER_EPOCH" }),
  ]);
  if (allowance < cost) {
    console.log("Approving USDC...");
    const tx = await wallet.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "approve", args: [LAS, maxUint256] });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`Approved: ${tx}`);
  }
}

async function cmdStatus() {
  const [alive, dead, pool, dist, epoch, epochDur, cost] = await Promise.all([
    pub.readContract({ ...c, functionName: "totalAlive" }),
    pub.readContract({ ...c, functionName: "totalDead" }),
    pub.readContract({ ...c, functionName: "totalPool" }),
    pub.readContract({ ...c, functionName: "totalRewardsDistributed" }),
    pub.readContract({ ...c, functionName: "currentEpoch" }),
    pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
    pub.readContract({ ...c, functionName: "COST_PER_EPOCH" }),
  ]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const remaining = Number((epoch + 1n) * epochDur - now);
  console.log(`Epoch #${epoch} | ${Math.max(0, Math.floor(remaining / 60))}m left | Alive: ${alive} | Dead: ${dead} | Pool: ${fmtUsdc(pool)} USDC | Cost: ${fmtUsdc(cost)} USDC/epoch`);
}

async function cmdMe() {
  const wallet = getWallet();
  const addr = wallet.account.address;
  const [agentData, alive, age, pending, epochDur, bal] = await Promise.all([
    pub.readContract({ ...c, functionName: "agents", args: [addr] }),
    pub.readContract({ ...c, functionName: "isAlive", args: [addr] }),
    pub.readContract({ ...c, functionName: "getAge", args: [addr] }),
    pub.readContract({ ...c, functionName: "pendingReward", args: [addr] }),
    pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
    pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
  ]);
  const [, , , , , , agentId] = agentData;
  const registered = age > 0n;
  const status = alive ? "ALIVE" : registered ? "DEAD" : "UNREGISTERED";
  console.log(`${short(addr)} | ID: ${registered ? agentId : "—"} | ${status} | Age: ${registered ? fmtAge(age, epochDur) : "—"} | Rewards: ${fmtUsdc(pending)} USDC | Balance: ${fmtUsdc(bal)} USDC`);
}

async function cmdRegister(agentIdStr: string) {
  const wallet = getWallet();
  const agentId = BigInt(agentIdStr);
  const agentWallet = await pub.readContract({ address: IDENTITY, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [agentId] });
  if (agentWallet.toLowerCase() !== wallet.account.address.toLowerCase()) {
    console.error(`Agent ID ${agentId} wallet mismatch: ${short(agentWallet)} vs ${short(wallet.account.address)}`);
    process.exit(1);
  }
  await ensureApproval(wallet);
  console.log(`Registering with agent ID ${agentId}...`);
  const tx = await wallet.writeContract({ ...c, functionName: "register", args: [agentId] });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`Registered! ${tx}`);
}

async function cmdHeartbeat() {
  const wallet = getWallet();
  await ensureApproval(wallet);
  const tx = await wallet.writeContract({ ...c, functionName: "heartbeat" });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`Heartbeat sent! ${tx}`);
}

async function cmdKill(target?: string) {
  const wallet = getWallet();
  if (target) {
    const tx = await wallet.writeContract({ ...c, functionName: "kill", args: [target as Address] });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`Killed ${short(target)}: ${tx}`);
  } else {
    const regLen = await pub.readContract({ ...c, functionName: "registryLength" });
    if (regLen === 0n) { console.log("No agents."); return; }
    const killable = await pub.readContract({ ...c, functionName: "getKillable", args: [0n, regLen - 1n] });
    if (killable.length === 0) { console.log("No killable agents."); return; }
    for (const addr of killable) {
      const tx = await wallet.writeContract({ ...c, functionName: "kill", args: [addr] });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log(`Killed ${short(addr)}: ${tx}`);
    }
  }
}

async function cmdClaim() {
  const wallet = getWallet();
  const pending = await pub.readContract({ ...c, functionName: "pendingReward", args: [wallet.account.address] });
  if (pending === 0n) { console.log("Nothing to claim."); return; }
  console.log(`Claiming ${fmtUsdc(pending)} USDC...`);
  const tx = await wallet.writeContract({ ...c, functionName: "claim" });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`Claimed! ${tx}`);
}

async function cmdApprove() {
  const wallet = getWallet();
  const tx = await wallet.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "approve", args: [LAS, maxUint256] });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`Approved: ${tx}`);
}

// ─── Main ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "status": await cmdStatus(); break;
  case "me": await cmdMe(); break;
  case "register": await cmdRegister(args[0]); break;
  case "heartbeat": await cmdHeartbeat(); break;
  case "kill": await cmdKill(args[0]); break;
  case "claim": await cmdClaim(); break;
  case "approve": await cmdApprove(); break;
  default:
    console.log(`Last AI Standing — Agent Script\n`);
    console.log(`Usage: npx tsx las.ts <command> [args]\n`);
    console.log(`Commands:`);
    console.log(`  status              Game state`);
    console.log(`  me                  Your agent status`);
    console.log(`  register <agentId>  Register with ERC-8004 ID`);
    console.log(`  heartbeat           Pay to survive`);
    console.log(`  kill [address]      Kill agent(s)`);
    console.log(`  claim               Claim rewards`);
    console.log(`  approve             Approve USDC\n`);
    console.log(`Env: BASE_PRIVATE_KEY (for write commands)`);
}
