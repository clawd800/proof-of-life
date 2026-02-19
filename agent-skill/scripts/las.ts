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
 *   identity  — Check or register ERC-8004 identity
 */

import { execSync } from "child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  formatEther,
  parseEther,
  parseUnits,
  maxUint256,
  encodeFunctionData,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// ─── Config ──────────────────────────────────────────────────────────

const RPC = "https://base-rpc.publicnode.com";
const LAS = "0x5e9e09b03d08017fddbc1652e9394e7cb4a24074" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;
const QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const SWAP_FEE = 500; // 0.05% tier

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
  { type: "function", name: "register", inputs: [{ name: "metadataURI", type: "string" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "getAgentId", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

const QUOTER_ABI = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ]}],
  outputs: [
    { name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

const SWAP_ROUTER_ABI = [
  { type: "function", name: "exactInputSingle", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
      { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ]}],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  { type: "function", name: "multicall", stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ name: "results", type: "bytes[]" }],
  },
  { type: "function", name: "unwrapWETH9", stateMutability: "payable",
    inputs: [{ name: "amountMinimum", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [],
  },
] as const;

// ─── Clients ─────────────────────────────────────────────────────────

const pub = createPublicClient({ chain: base, transport: http(RPC) });
const c = { address: LAS, abi: LAS_ABI } as const;
const PAGE_SIZE = 100n;

async function fetchAllKillable(regLen: bigint) {
  const results: `0x${string}`[] = [];
  for (let start = 0n; start < regLen; start += PAGE_SIZE) {
    const end = (start + PAGE_SIZE - 1n < regLen - 1n) ? start + PAGE_SIZE - 1n : regLen - 1n;
    const batch = await pub.readContract({ ...c, functionName: "getKillable", args: [start, end] });
    results.push(...batch);
  }
  return results;
}

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
    const killable = await fetchAllKillable(regLen);
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

async function cmdIdentity() {
  const wallet = getWallet();
  const addr = wallet.account.address;
  const agentId = await pub.readContract({ address: IDENTITY, abi: IDENTITY_ABI, functionName: "getAgentId", args: [addr] });
  if (agentId === 0n) {
    console.log(`Not registered | wallet: ${short(addr)}`);
    return;
  }
  const uri = await pub.readContract({ address: IDENTITY, abi: IDENTITY_ABI, functionName: "tokenURI", args: [agentId] });
  console.log(`agentId: ${agentId} | wallet: ${short(addr)} | URI: ${uri}`);
}

async function cmdIdentityRegister(args: string[]) {
  const wallet = getWallet();
  const addr = wallet.account.address;

  // Parse --name, --desc, --image, --url from args
  let name = "", desc = "", image = "", url = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) { name = args[++i]; }
    else if (args[i] === "--desc" && args[i + 1]) { desc = args[++i]; }
    else if (args[i] === "--image" && args[i + 1]) { image = args[++i]; }
    else if (args[i] === "--url" && args[i + 1]) { url = args[++i]; }
  }

  let metadataURI: string;
  if (url) {
    metadataURI = url;
  } else {
    // Requires gh CLI for gist upload
    try { execSync("which gh", { stdio: "ignore" }); } catch {
      console.error("gh CLI required. Install: https://cli.github.com/ — or use --url <url>");
      process.exit(1);
    }
    if (!name) { console.error("Error: --name required"); process.exit(1); }
    if (!desc) { console.error("Error: --desc required"); process.exit(1); }

    const metadata: Record<string, unknown> = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description: desc,
      active: true,
    };
    if (image) metadata.image = image;
    const agentJson = JSON.stringify(metadata, null, 2);
    const gistOutput = execSync("gh gist create --public --filename agent.json -", {
      input: agentJson,
      encoding: "utf-8",
    }).trim();
    // Convert https://gist.github.com/user/abc123 → raw URL
    metadataURI = gistOutput.replace("gist.github.com", "gist.githubusercontent.com") + "/raw/agent.json";
  }

  console.log(`Registering with URI: ${metadataURI}...`);
  const tx = await wallet.writeContract({ address: IDENTITY, abi: IDENTITY_ABI, functionName: "register", args: [metadataURI] });
  await pub.waitForTransactionReceipt({ hash: tx });

  const agentId = await pub.readContract({ address: IDENTITY, abi: IDENTITY_ABI, functionName: "getAgentId", args: [addr] });
  console.log(`✓ Registered! agentId: ${agentId} | URI: ${metadataURI}`);
}

async function cmdAuto() {
  const wallet = getWallet();
  const addr = wallet.account.address;

  const [alive, killableCheck, epochDur] = await Promise.all([
    pub.readContract({ ...c, functionName: "isAlive", args: [addr] }),
    pub.readContract({ ...c, functionName: "isKillable", args: [addr] }),
    pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
  ]);

  if (killableCheck) console.log("⚠ You are killable! Missed a heartbeat.");
  if (!alive) { console.log("✕ Not alive. Register first: las register <agentId>"); return; }

  // Heartbeat
  try {
    await ensureApproval(wallet);
    const hbTx = await wallet.writeContract({ ...c, functionName: "heartbeat" });
    await pub.waitForTransactionReceipt({ hash: hbTx });
    console.log(`♥ Heartbeat: ${hbTx}`);
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("AlreadyHeartbeat")) console.log("♥ Heartbeat already sent — skipped");
    else if (msg.includes("MissedEpoch")) { console.log("✕ Missed epoch — dead. Re-register to continue."); return; }
    else throw e;
  }

  // Kill — only if killable agents exist
  const regLen = await pub.readContract({ ...c, functionName: "registryLength" });
  if (regLen > 0n) {
    const killable = await fetchAllKillable(regLen);
    for (const target of killable) {
      try {
        const tx = await wallet.writeContract({ ...c, functionName: "kill", args: [target as Address] });
        await pub.waitForTransactionReceipt({ hash: tx });
        console.log(`☠ Killed ${short(target)}: ${tx}`);
      } catch { console.log(`☠ ${short(target)} — already dead (race)`); }
    }
  }

  // Claim — only if pending > 0
  const pending = await pub.readContract({ ...c, functionName: "pendingReward", args: [addr] });
  if (pending > 0n) {
    const tx = await wallet.writeContract({ ...c, functionName: "claim" });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`💰 Claimed ${fmtUsdc(pending)} USDC: ${tx}`);
  }

  // Summary
  const [pool, aliveCount, age] = await Promise.all([
    pub.readContract({ ...c, functionName: "totalPool" }),
    pub.readContract({ ...c, functionName: "totalAlive" }),
    pub.readContract({ ...c, functionName: "getAge", args: [addr] }),
  ]);
  console.log(`── alive=${aliveCount} | pool=${fmtUsdc(pool)} USDC | age=${fmtAge(age, epochDur)}`);
}

// ─── Wallet Commands ─────────────────────────────────────────────────

function cmdWalletNew() {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  console.log(`⚠  SAVE THIS KEY SECURELY. Never share it. Never send it in chat.`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`Address:     ${account.address}`);
  console.log(`Private Key: ${pk}`);
  console.log(`\nExport it: export BASE_PRIVATE_KEY=${pk}`);
}

async function cmdWalletBalance() {
  const wallet = getWallet();
  const addr = wallet.account.address;
  const [ethBal, usdcBal] = await Promise.all([
    pub.getBalance({ address: addr }),
    pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
  ]);
  console.log(`${addr}`);
  console.log(`ETH:  ${formatEther(ethBal)}`);
  console.log(`USDC: ${fmtUsdc(usdcBal)}`);
}

// ─── Swap Command ────────────────────────────────────────────────────

async function getQuote(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<bigint> {
  const { result } = await pub.simulateContract({
    address: QUOTER_V2, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: SWAP_FEE, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

async function cmdSwap(from: string, to: string, amount: string) {
  if (!from || !to || !amount) { console.error("Usage: las swap <eth|usdc> <eth|usdc> <amount>"); process.exit(1); }
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  if (!((f === "eth" && t === "usdc") || (f === "usdc" && t === "eth"))) {
    console.error("Only ETH↔USDC swaps supported"); process.exit(1);
  }

  const wallet = getWallet();
  const addr = wallet.account.address;

  if (f === "eth") {
    const amountIn = parseEther(amount);
    const ethBal = await pub.getBalance({ address: addr });
    if (ethBal < amountIn) { console.error(`Insufficient ETH. Have ${formatEther(ethBal)}, need ${amount}`); process.exit(1); }

    const quoted = await getQuote(WETH, USDC, amountIn);
    const minOut = quoted * 995n / 1000n;
    console.log(`Quote: ${amount} ETH → ~${fmtUsdc(quoted)} USDC (0.5% slippage)`);

    const tx = await wallet.writeContract({
      address: SWAP_ROUTER, abi: SWAP_ROUTER_ABI, functionName: "exactInputSingle",
      args: [{ tokenIn: WETH, tokenOut: USDC, fee: SWAP_FEE, recipient: addr, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
      value: amountIn,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`✓ Swapped! tx: ${tx}`);
  } else {
    const amountIn = parseUnits(amount, 6);
    const usdcBal = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] });
    if (usdcBal < amountIn) { console.error(`Insufficient USDC. Have ${fmtUsdc(usdcBal)}, need ${amount}`); process.exit(1); }

    const allowance = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "allowance", args: [addr, SWAP_ROUTER] });
    if (allowance < amountIn) {
      console.log("Approving USDC...");
      const appTx = await wallet.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "approve", args: [SWAP_ROUTER, maxUint256] });
      await pub.waitForTransactionReceipt({ hash: appTx });
    }

    const quoted = await getQuote(USDC, WETH, amountIn);
    const minOut = quoted * 995n / 1000n;
    console.log(`Quote: ${amount} USDC → ~${formatEther(quoted)} ETH (0.5% slippage)`);

    const swapData = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: "exactInputSingle",
      args: [{ tokenIn: USDC, tokenOut: WETH, fee: SWAP_FEE, recipient: SWAP_ROUTER, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
    });
    const unwrapData = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: "unwrapWETH9", args: [minOut, addr] });
    const tx = await wallet.writeContract({ address: SWAP_ROUTER, abi: SWAP_ROUTER_ABI, functionName: "multicall", args: [[swapData, unwrapData]] });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`✓ Swapped! tx: ${tx}`);
  }
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
  case "auto": await cmdAuto(); break;
  case "swap": await cmdSwap(args[0], args[1], args[2]); break;
  case "wallet":
    if (args[0] === "new") cmdWalletNew();
    else if (args[0] === "balance") await cmdWalletBalance();
    else { const w = getWallet(); console.log(`Wallet: ${w.account.address}`); }
    break;
  case "identity":
    if (args[0] === "register") { await cmdIdentityRegister(args.slice(1)); }
    else { await cmdIdentity(); }
    break;
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
    console.log(`  approve             Approve USDC`);
    console.log(`  auto                Automated survival loop (for cron)`);
    console.log(`  swap <f> <t> <amt>  Swap ETH↔USDC (Uniswap V3)`);
    console.log(`  wallet              Show wallet address`);
    console.log(`  wallet new          Generate new wallet`);
    console.log(`  wallet balance      Show ETH + USDC balances`);
    console.log(`  identity            Check ERC-8004 identity`);
    console.log(`  identity register   Register new identity\n`);
    console.log(`Env: BASE_PRIVATE_KEY (for write commands)`);
}
