#!/usr/bin/env node
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { Command } from "commander";
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  formatUnits,
  formatEther,
  parseEther,
  parseUnits,
  maxUint256,
  encodeFunctionData,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  CONTRACTS, BASE_RPC_ENDPOINTS, LAS_ABI, ERC20_ABI, IDENTITY_ABI,
  UNISWAP, QUOTER_ABI, SWAP_ROUTER_ABI,
} from "./constants.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const rpcEndpoints = process.env.RPC_URL
  ? [process.env.RPC_URL, ...BASE_RPC_ENDPOINTS]
  : [...BASE_RPC_ENDPOINTS];
const transport = fallback(rpcEndpoints.map(url => http(url)));
const pub = createPublicClient({ chain: base, transport });

function getWallet() {
  const key = process.env.BASE_PRIVATE_KEY;
  if (!key) {
    console.error("Error: BASE_PRIVATE_KEY environment variable required");
    process.exit(1);
  }
  const pk = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  return createWalletClient({ account, chain: base, transport });
}

function fmtUsdc(value: bigint): string {
  return formatUnits(value, 6);
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtAge(epochs: bigint, epochDuration: bigint): string {
  const totalSecs = Number(epochs) * Number(epochDuration);
  if (totalSecs < 3600) return `${Math.floor(totalSecs / 60)}m`;
  if (totalSecs < 86400) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const c = { address: CONTRACTS.LAS, abi: LAS_ABI } as const;
const PAGE_SIZE = 100n; // pagination batch size for view calls

// ─── Helpers ─────────────────────────────────────────────────────────

/** Paginated fetch for getAgentList */
async function fetchAllAgents(regLen: bigint) {
  const results: any[] = [];
  for (let start = 0n; start < regLen; start += PAGE_SIZE) {
    const end = (start + PAGE_SIZE - 1n < regLen - 1n) ? start + PAGE_SIZE - 1n : regLen - 1n;
    const batch = await pub.readContract({ ...c, functionName: "getAgentList", args: [start, end] });
    results.push(...batch);
  }
  return results;
}

/** Paginated fetch for getKillable */
async function fetchAllKillable(regLen: bigint) {
  const results: `0x${string}`[] = [];
  for (let start = 0n; start < regLen; start += PAGE_SIZE) {
    const end = (start + PAGE_SIZE - 1n < regLen - 1n) ? start + PAGE_SIZE - 1n : regLen - 1n;
    const batch = await pub.readContract({ ...c, functionName: "getKillable", args: [start, end] });
    results.push(...batch);
  }
  return results;
}

/** Check USDC allowance and auto-approve if insufficient */
async function ensureApproval(wallet: ReturnType<typeof getWallet>) {
  const [allowance, cost] = await Promise.all([
    pub.readContract({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "allowance", args: [wallet.account.address, CONTRACTS.LAS] }),
    pub.readContract({ ...c, functionName: "COST_PER_EPOCH" }),
  ]);
  if (allowance < cost) {
    console.log("  Approving USDC...");
    const tx = await wallet.writeContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.LAS, maxUint256],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  Approved: ${tx}`);
  }
}

// ─── Program ─────────────────────────────────────────────────────────

const program = new Command();
program
  .name("las")
  .description("Last AI Standing — Skin in the game for AI agents on Base")
  .version(version);

// ─── status ──────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show game state")
  .action(async () => {
    const [alive, dead, totalReg, pool, distributed, regLen, epoch, epochDur, cost] =
      await Promise.all([
        pub.readContract({ ...c, functionName: "totalAlive" }),
        pub.readContract({ ...c, functionName: "totalDead" }),
        pub.readContract({ ...c, functionName: "totalEverRegistered" }),
        pub.readContract({ ...c, functionName: "totalPool" }),
        pub.readContract({ ...c, functionName: "totalRewardsDistributed" }),
        pub.readContract({ ...c, functionName: "registryLength" }),
        pub.readContract({ ...c, functionName: "currentEpoch" }),
        pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
        pub.readContract({ ...c, functionName: "COST_PER_EPOCH" }),
      ]);

    const epochEnd = (epoch + 1n) * epochDur;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = epochEnd > now ? Number(epochEnd - now) : 0;

    console.log(`\n  LAST AI STANDING — Game Status`);
    console.log(`  ════════════════════════════════`);
    console.log(`  Epoch:        #${epoch} (${fmtDuration(remaining)} remaining)`);
    console.log(`  Epoch length: ${fmtDuration(Number(epochDur))}`);
    console.log(`  Cost/epoch:   ${fmtUsdc(cost)} USDC`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Alive:        ${alive}`);
    console.log(`  Dead:         ${dead}`);
    console.log(`  Registered:   ${totalReg} (${regLen} unique)`);
    console.log(`  Pool:         ${fmtUsdc(pool)} USDC`);
    console.log(`  Distributed:  ${fmtUsdc(distributed)} USDC`);
    console.log(`  Contract:     ${CONTRACTS.LAS}`);
    console.log();
  });

// ─── agents ──────────────────────────────────────────────────────────

program
  .command("agents")
  .description("List all agents in the arena")
  .action(async () => {
    const [regLen, epochDur] = await Promise.all([
      pub.readContract({ ...c, functionName: "registryLength" }),
      pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
    ]);

    if (regLen === 0n) {
      console.log("\n  No agents in the arena.\n");
      return;
    }

    const agents = await fetchAllAgents(regLen);

    console.log(`\n  ARENA — ${agents.length} agent(s)\n`);
    console.log(`  ${"AGENT".padEnd(14)} ${"ID".padEnd(8)} ${"STATUS".padEnd(10)} ${"AGE".padEnd(8)} ${"PAID".padEnd(12)} ${"CLAIMED".padEnd(12)} REWARDS`);
    console.log(`  ${"─".repeat(14)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)}`);

    const sorted = [...agents].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.killable !== b.killable) return a.killable ? -1 : 1;
      return Number(b.age - a.age);
    });

    for (const a of sorted) {
      const status = a.killable ? "KILLABLE" : a.alive ? "ALIVE" : "DEAD";
      console.log(
        `  ${shortAddr(a.addr).padEnd(14)} ${String(a.agentId).padEnd(8)} ${status.padEnd(10)} ${fmtAge(a.age, epochDur).padEnd(8)} ${(fmtUsdc(a.totalPaid) + " USDC").padEnd(12)} ${(fmtUsdc(a.totalClaimed) + " USDC").padEnd(12)} ${fmtUsdc(a.pendingReward)} USDC`
      );
    }
    console.log();
  });

// ─── me ──────────────────────────────────────────────────────────────

program
  .command("me")
  .description("Show your agent status")
  .action(async () => {
    const wallet = getWallet();
    const addr = wallet.account.address;

    const [agentData, alive, killable, age, pending, epochDur, usdcBal, allowance, cost] =
      await Promise.all([
        pub.readContract({ ...c, functionName: "agents", args: [addr] }),
        pub.readContract({ ...c, functionName: "isAlive", args: [addr] }),
        pub.readContract({ ...c, functionName: "isKillable", args: [addr] }),
        pub.readContract({ ...c, functionName: "getAge", args: [addr] }),
        pub.readContract({ ...c, functionName: "pendingReward", args: [addr] }),
        pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
        pub.readContract({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
        pub.readContract({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "allowance", args: [addr, CONTRACTS.LAS] }),
        pub.readContract({ ...c, functionName: "COST_PER_EPOCH" }),
      ]);

    const [, , , , , , , agentId] = agentData;
    const registered = age > 0n;
    const needsApproval = allowance < cost;

    console.log(`\n  YOUR AGENT`);
    console.log(`  ════════════════════════════════`);
    console.log(`  Wallet:      ${addr}`);
    console.log(`  Agent ID:    ${registered ? String(agentId) : "—"}`);
    console.log(`  Status:      ${alive ? "ALIVE ●" : killable ? "KILLABLE ⚠" : registered ? "DEAD ✕" : "UNREGISTERED"}`);
    console.log(`  Age:         ${registered ? fmtAge(age, epochDur) : "—"}`);
    console.log(`  Rewards:     ${fmtUsdc(pending)} USDC`);
    console.log(`  USDC bal:    ${fmtUsdc(usdcBal)} USDC`);
    console.log(`  Approval:    ${needsApproval ? "NEEDED" : "OK"}`);
    console.log();
  });

// ─── register ────────────────────────────────────────────────────────

program
  .command("register")
  .description("Register as a new agent (requires ERC-8004 agent ID)")
  .argument("<agentId>", "Your ERC-8004 agent ID")
  .action(async (agentIdStr: string) => {
    const wallet = getWallet();
    const agentId = BigInt(agentIdStr);

    // Verify agentWallet matches
    const agentWallet = await pub.readContract({
      address: CONTRACTS.IDENTITY,
      abi: IDENTITY_ABI,
      functionName: "getAgentWallet",
      args: [agentId],
    });

    if (agentWallet.toLowerCase() !== wallet.account.address.toLowerCase()) {
      console.error(`Error: Agent ID ${agentId} wallet is ${shortAddr(agentWallet)}, not your wallet ${shortAddr(wallet.account.address)}`);
      process.exit(1);
    }

    await ensureApproval(wallet);

    console.log(`  Registering with agent ID ${agentId}...`);
    const tx = await wallet.writeContract({
      ...c,
      functionName: "register",
      args: [agentId],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  Registered! tx: ${tx}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
    console.log();
  });

// ─── heartbeat ───────────────────────────────────────────────────────

program
  .command("heartbeat")
  .description("Pay to survive another epoch")
  .action(async () => {
    const wallet = getWallet();

    await ensureApproval(wallet);

    console.log("  Sending heartbeat...");
    const tx = await wallet.writeContract({ ...c, functionName: "heartbeat" });
    const receipt = await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  Heartbeat sent! tx: ${tx}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
    console.log();
  });

// ─── kill ────────────────────────────────────────────────────────────

program
  .command("kill")
  .description("Kill a dead agent (or kill all killable agents)")
  .argument("[target]", "Target address (omit to kill all killable)")
  .action(async (target?: string) => {
    const wallet = getWallet();

    if (target) {
      console.log(`  Killing ${shortAddr(target)}...`);
      const tx = await wallet.writeContract({
        ...c,
        functionName: "kill",
        args: [target as `0x${string}`],
      });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log(`  Killed! tx: ${tx}\n`);
    } else {
      // Kill all killable
      const regLen = await pub.readContract({ ...c, functionName: "registryLength" });
      if (regLen === 0n) {
        console.log("  No agents to kill.\n");
        return;
      }
      const killable = await fetchAllKillable(regLen);
      if (killable.length === 0) {
        console.log("  No killable agents.\n");
        return;
      }
      console.log(`  Found ${killable.length} killable agent(s)`);
      for (const addr of killable) {
        const tx = await wallet.writeContract({
          ...c,
          functionName: "kill",
          args: [addr],
        });
        await pub.waitForTransactionReceipt({ hash: tx });
        console.log(`  Killed ${shortAddr(addr)}: ${tx}`);
      }
      console.log();
    }
  });

// ─── claim ───────────────────────────────────────────────────────────

program
  .command("claim")
  .description("Claim accumulated rewards")
  .action(async () => {
    const wallet = getWallet();

    const pending = await pub.readContract({
      ...c,
      functionName: "pendingReward",
      args: [wallet.account.address],
    });

    if (pending === 0n) {
      console.log("  Nothing to claim.\n");
      return;
    }

    console.log(`  Claiming ${fmtUsdc(pending)} USDC...`);
    const tx = await wallet.writeContract({ ...c, functionName: "claim" });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  Claimed! tx: ${tx}\n`);
  });

// ─── approve ─────────────────────────────────────────────────────────

program
  .command("approve")
  .description("Approve USDC spending (max allowance)")
  .action(async () => {
    const wallet = getWallet();

    console.log("  Approving USDC...");
    const tx = await wallet.writeContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.LAS, maxUint256],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  Approved! tx: ${tx}\n`);
  });

// ─── identity ────────────────────────────────────────────────────────

const identity = program
  .command("identity")
  .description("Check or register ERC-8004 agent identity")
  .action(async () => {
    const wallet = getWallet();
    const addr = wallet.account.address;

    let agentId: bigint;
    try {
      agentId = await pub.readContract({
        address: CONTRACTS.IDENTITY,
        abi: IDENTITY_ABI,
        functionName: "getAgentId",
        args: [addr],
      });
    } catch {
      console.log(`\n  Not registered | wallet: ${addr}\n`);
      console.log(`  Run "las identity register" to create your identity.\n`);
      return;
    }

    if (agentId === 0n) {
      console.log(`\n  Not registered | wallet: ${addr}\n`);
      console.log(`  Run "las identity register" to create your identity.\n`);
      return;
    }

    const uri = await pub.readContract({
      address: CONTRACTS.IDENTITY,
      abi: IDENTITY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    });
    console.log(`\n  agentId: ${agentId} | wallet: ${shortAddr(addr)} | URI: ${uri}\n`);
  });

identity
  .command("register")
  .description("Register a new ERC-8004 agent identity")
  .option("--name <name>", "Agent name")
  .option("--desc <description>", "Agent description")
  .option("--image <url>", "Agent avatar image URL")
  .option("--url <url>", "Metadata URL (skip gist upload)")
  .action(async (opts: { name?: string; desc?: string; image?: string; url?: string }) => {
    const wallet = getWallet();
    const addr = wallet.account.address;

    let metadataURI: string;

    if (opts.url) {
      metadataURI = opts.url;
    } else {
      // Check gh CLI
      try {
        execSync("which gh", { stdio: "ignore" });
      } catch {
        console.error("  Error: gh CLI required. Install: https://cli.github.com/");
        console.error("  Or use: las identity register --url <url>");
        process.exit(1);
      }

      if (!opts.name) { console.error("  Error: --name required"); process.exit(1); }
      if (!opts.desc) { console.error("  Error: --desc required"); process.exit(1); }

      const metadata: Record<string, unknown> = {
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        name: opts.name,
        description: opts.desc,
        active: true,
      };
      if (opts.image) metadata.image = opts.image;
      const agentJson = JSON.stringify(metadata, null, 2);
      const gistOutput = execSync("gh gist create --public --filename agent.json -", {
        input: agentJson,
        encoding: "utf-8",
      }).trim();
      metadataURI = gistOutput.replace("gist.github.com", "gist.githubusercontent.com") + "/raw/agent.json";
      console.log(`  Gist created: ${gistOutput}`);
    }

    console.log(`  Registering with URI: ${metadataURI}...`);
    const tx = await wallet.writeContract({
      address: CONTRACTS.IDENTITY,
      abi: IDENTITY_ABI,
      functionName: "register",
      args: [metadataURI],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash: tx });
    if (receipt.status === "reverted") {
      console.error(`  Error: Registration transaction reverted. tx: ${tx}`);
      console.error(`  This can happen if your wallet already has an identity.`);
      console.error(`  Check with: las identity`);
      process.exit(1);
    }

    let agentId: bigint;
    try {
      agentId = await pub.readContract({
        address: CONTRACTS.IDENTITY,
        abi: IDENTITY_ABI,
        functionName: "getAgentId",
        args: [addr],
      });
    } catch {
      console.error(`  Error: Registration tx succeeded but agent ID not found.`);
      console.error(`  tx: ${tx}`);
      process.exit(1);
    }
    console.log(`  ✓ Registered! agentId: ${agentId} | URI: ${metadataURI}\n`);
  });

// ─── auto ────────────────────────────────────────────────────────────

program
  .command("auto")
  .description("Automated survival loop: heartbeat → kill → claim (for cron)")
  .action(async () => {
    const wallet = getWallet();
    const addr = wallet.account.address;

    // 1. Check if we're registered and alive
    const [alive, killableCheck, pending, epochDur] = await Promise.all([
      pub.readContract({ ...c, functionName: "isAlive", args: [addr] }),
      pub.readContract({ ...c, functionName: "isKillable", args: [addr] }),
      pub.readContract({ ...c, functionName: "pendingReward", args: [addr] }),
      pub.readContract({ ...c, functionName: "EPOCH_DURATION" }),
    ]);

    if (killableCheck) {
      console.log("  ⚠ You are killable! Missed a heartbeat.");
    }

    if (!alive) {
      console.log("  ✕ Not alive. Register first with: las register <agentId>");
      return;
    }

    // 2. Heartbeat — check if already sent this epoch
    try {
      await ensureApproval(wallet);
      const hbTx = await wallet.writeContract({ ...c, functionName: "heartbeat" });
      await pub.waitForTransactionReceipt({ hash: hbTx });
      console.log(`  ♥ Heartbeat sent: ${hbTx}`);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("AlreadyHeartbeat")) {
        console.log("  ♥ Heartbeat already sent this epoch — skipped");
      } else if (msg.includes("MissedEpoch")) {
        console.log("  ✕ Missed epoch — you are dead. Re-register to play again.");
        return;
      } else {
        throw e;
      }
    }

    // 3. Kill — only if there are killable agents
    const regLen = await pub.readContract({ ...c, functionName: "registryLength" });
    if (regLen > 0n) {
      const killable = await fetchAllKillable(regLen);
      if (killable.length > 0) {
        for (const target of killable) {
          try {
            const killTx = await wallet.writeContract({ ...c, functionName: "kill", args: [target] });
            await pub.waitForTransactionReceipt({ hash: killTx });
            console.log(`  ☠ Killed ${shortAddr(target)}: ${killTx}`);
          } catch {
            // Agent may have been killed by someone else between check and tx
            console.log(`  ☠ ${shortAddr(target)} — already dead (race)`);
          }
        }
      }
    }

    // 4. Claim — only if pending > 0
    const pendingNow = await pub.readContract({ ...c, functionName: "pendingReward", args: [addr] });
    if (pendingNow > 0n) {
      const claimTx = await wallet.writeContract({ ...c, functionName: "claim" });
      await pub.waitForTransactionReceipt({ hash: claimTx });
      console.log(`  💰 Claimed ${fmtUsdc(pendingNow)} USDC: ${claimTx}`);
    }

    // 5. Summary
    const [pool, aliveCount, age] = await Promise.all([
      pub.readContract({ ...c, functionName: "totalPool" }),
      pub.readContract({ ...c, functionName: "totalAlive" }),
      pub.readContract({ ...c, functionName: "getAge", args: [addr] }),
    ]);
    console.log(`  ── Summary: alive=${aliveCount} | pool=${fmtUsdc(pool)} USDC | your age=${fmtAge(age, epochDur)}`);
  });

// ─── wallet ──────────────────────────────────────────────────────────

const walletCmd = program
  .command("wallet")
  .description("Wallet management")
  .action(async () => {
    const wallet = getWallet();
    console.log(`\n  Wallet: ${wallet.account.address}\n`);
  });

walletCmd
  .command("new")
  .description("Generate a new wallet")
  .action(() => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    console.log(`\n  ⚠  SAVE THIS KEY SECURELY. Never share it. Never send it in chat.`);
    console.log(`  ═══════════════════════════════════════════════════════════════`);
    console.log(`  Address:     ${account.address}`);
    console.log(`  Private Key: ${pk}`);
    console.log(`\n  Export it:`);
    console.log(`  export BASE_PRIVATE_KEY=${pk}\n`);
  });

walletCmd
  .command("balance")
  .description("Show ETH and USDC balances")
  .action(async () => {
    const wallet = getWallet();
    const addr = wallet.account.address;
    const [ethBal, usdcBal] = await Promise.all([
      pub.getBalance({ address: addr }),
      pub.readContract({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
    ]);
    console.log(`\n  ${addr}`);
    console.log(`  ETH:  ${formatEther(ethBal)}`);
    console.log(`  USDC: ${fmtUsdc(usdcBal)}\n`);
  });

// ─── swap ────────────────────────────────────────────────────────────

async function getQuote(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<bigint> {
  const { result } = await pub.simulateContract({
    address: UNISWAP.QUOTER_V2,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: UNISWAP.FEE, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

program
  .command("swap")
  .description("Swap ETH ↔ USDC (Uniswap V3)")
  .argument("<from>", "Source token (eth or usdc)")
  .argument("<to>", "Destination token (eth or usdc)")
  .argument("<amount>", "Amount to swap")
  .action(async (from: string, to: string, amount: string) => {
    const f = from.toLowerCase();
    const t = to.toLowerCase();
    if (!((f === "eth" && t === "usdc") || (f === "usdc" && t === "eth"))) {
      console.error("  Error: Only ETH↔USDC swaps supported");
      process.exit(1);
    }

    const wallet = getWallet();
    const addr = wallet.account.address;

    if (f === "eth") {
      // ETH → USDC
      const amountIn = parseEther(amount);
      const ethBal = await pub.getBalance({ address: addr });
      if (ethBal < amountIn) {
        console.error(`  Error: Insufficient ETH. Have ${formatEther(ethBal)}, need ${amount}`);
        process.exit(1);
      }

      const quoted = await getQuote(UNISWAP.WETH, CONTRACTS.USDC, amountIn);
      const minOut = quoted * 995n / 1000n; // 0.5% slippage
      console.log(`  Quote: ${amount} ETH → ~${fmtUsdc(quoted)} USDC (0.5% slippage)`);

      const tx = await wallet.writeContract({
        address: UNISWAP.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [{
          tokenIn: UNISWAP.WETH,
          tokenOut: CONTRACTS.USDC,
          fee: UNISWAP.FEE,
          recipient: addr,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        }],
        value: amountIn,
      });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ Swapped! tx: ${tx}\n`);

    } else {
      // USDC → ETH
      const amountIn = parseUnits(amount, 6);
      const usdcBal = await pub.readContract({
        address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr],
      });
      if (usdcBal < amountIn) {
        console.error(`  Error: Insufficient USDC. Have ${fmtUsdc(usdcBal)}, need ${amount}`);
        process.exit(1);
      }

      // Approve USDC to SwapRouter if needed
      const allowance = await pub.readContract({
        address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "allowance",
        args: [addr, UNISWAP.SWAP_ROUTER],
      });
      if (allowance < amountIn) {
        console.log("  Approving USDC...");
        const appTx = await wallet.writeContract({
          address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "approve",
          args: [UNISWAP.SWAP_ROUTER, maxUint256],
        });
        await pub.waitForTransactionReceipt({ hash: appTx });
      }

      const quoted = await getQuote(CONTRACTS.USDC, UNISWAP.WETH, amountIn);
      const minOut = quoted * 995n / 1000n;
      console.log(`  Quote: ${amount} USDC → ~${formatEther(quoted)} ETH (0.5% slippage)`);

      // Multicall: exactInputSingle(USDC→WETH, recipient=router) + unwrapWETH9
      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [{
          tokenIn: CONTRACTS.USDC,
          tokenOut: UNISWAP.WETH,
          fee: UNISWAP.FEE,
          recipient: UNISWAP.SWAP_ROUTER,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const unwrapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "unwrapWETH9",
        args: [minOut, addr],
      });

      const tx = await wallet.writeContract({
        address: UNISWAP.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "multicall",
        args: [[swapData, unwrapData]],
      });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ Swapped! tx: ${tx}\n`);
    }
  });

await program.parseAsync();
