/**
 * Last AI Standing CLI — Unit Tests
 * Mocks viem at the module level to test all CLI commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock State ──────────────────────────────────────────────────────

const COST_PER_EPOCH = 100_000n; // 0.1 USDC (6 decimals)
const EPOCH_DURATION = 600n;     // 10 minutes
const MOCK_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const MOCK_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MOCK_TX = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const MOCK_GIST_URL = "https://gist.github.com/testuser/abc123";

// Track all writeContract calls for assertion
let writeContractCalls: Array<{ address?: string; functionName: string; args?: any[] }> = [];
// Configurable mock state
let mockState = defaultMockState();
// Mock execSync behavior
let mockExecSyncFn: ((cmd: string, opts?: any) => string) | null = null;

function defaultMockState() {
  return {
    currentEpoch: 10n,
    totalAlive: 5n,
    totalDead: 2n,
    totalEverRegistered: 7n,
    totalPool: 1_000_000n,
    totalRewardsDistributed: 500_000n,
    costPerEpoch: COST_PER_EPOCH,
    epochDuration: EPOCH_DURATION,
    registryLength: 7n,
    isAlive: true,
    isKillable: false,
    age: 5n,
    pendingReward: 50_000n,
    ethBalance: 1_000_000_000_000_000_000n, // 1 ETH
    usdcBalance: 10_000_000n, // 10 USDC
    usdcAllowance: 0n,       // no allowance by default (triggers auto-approve)
    agentWallet: MOCK_WALLET,
    killableAddresses: [] as string[],
    agents: {
      birthEpoch: 5n,
      lastHeartbeatEpoch: 10n,
      alive: true,
      totalPaid: 500_000n,
      rewardDebt: 0n,
      claimable: 50_000n,
      agentId: 42n,
    },
    agentList: [{
      addr: MOCK_WALLET,
      agentId: 42n,
      birthEpoch: 5n,
      lastHeartbeatEpoch: 10n,
      alive: true,
      killable: false,
      age: 5n,
      totalPaid: 500_000n,
      pendingReward: 50_000n,
    }],
    // ERC-8004 identity fields
    identityAgentId: 0n,
    identityTokenURI: "",
    // Swap quote
    quoteAmountOut: 2_500_000n, // ~2.5 USDC for quote mock
  };
}

// ─── Mock readContract ───────────────────────────────────────────────

function mockReadContract({ address, functionName, args }: any): any {
  // USDC ERC20 calls
  if (address === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") {
    if (functionName === "balanceOf") return mockState.usdcBalance;
    if (functionName === "allowance") return mockState.usdcAllowance;
  }
  // Identity Registry
  if (address === "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432") {
    if (functionName === "getAgentWallet") return mockState.agentWallet;
    if (functionName === "getAgentId") return mockState.identityAgentId;
    if (functionName === "tokenURI") return mockState.identityTokenURI;
  }
  // LAS contract
  switch (functionName) {
    case "COST_PER_EPOCH": return mockState.costPerEpoch;
    case "EPOCH_DURATION": return mockState.epochDuration;
    case "currentEpoch": return mockState.currentEpoch;
    case "totalAlive": return mockState.totalAlive;
    case "totalDead": return mockState.totalDead;
    case "totalEverRegistered": return mockState.totalEverRegistered;
    case "totalPool": return mockState.totalPool;
    case "totalRewardsDistributed": return mockState.totalRewardsDistributed;
    case "registryLength": return mockState.registryLength;
    case "isAlive": return mockState.isAlive;
    case "isKillable": return mockState.isKillable;
    case "getAge": return mockState.age;
    case "pendingReward": return mockState.pendingReward;
    case "agents": {
      const a = mockState.agents;
      return [a.birthEpoch, a.lastHeartbeatEpoch, a.alive, a.totalPaid, a.rewardDebt, a.claimable, a.agentId];
    }
    case "getKillable": return mockState.killableAddresses;
    case "getAgentList": return mockState.agentList;
    default: return 0n;
  }
}

function mockSimulateContract({ functionName }: any) {
  if (functionName === "quoteExactInputSingle") {
    return { result: [mockState.quoteAmountOut, 0n, 0, 0n] };
  }
  return { result: 0n };
}

// ─── Mock viem ───────────────────────────────────────────────────────

const mockWriteContract = vi.fn(async (params: any) => {
  writeContractCalls.push({ address: params.address, functionName: params.functionName, args: params.args ? [...params.args] : undefined });
  return MOCK_TX;
});

const mockWalletClient = {
  account: { address: MOCK_WALLET },
  writeContract: mockWriteContract,
};

function createMockPublicClient() {
  return {
    readContract: vi.fn(mockReadContract),
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success", gasUsed: 50000n })),
    getBalance: vi.fn(async () => mockState.ethBalance),
    simulateContract: vi.fn(mockSimulateContract),
  };
}

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => createMockPublicClient()),
    createWalletClient: vi.fn(() => mockWalletClient),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: MOCK_WALLET, signMessage: vi.fn(), signTransaction: vi.fn() })),
  generatePrivateKey: vi.fn(() => MOCK_PK),
}));

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base", network: "base", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://base-rpc.publicnode.com"] } } },
}));

vi.mock("child_process", () => ({
  execSync: vi.fn((cmd: string, opts?: any) => {
    if (mockExecSyncFn) return mockExecSyncFn(cmd, opts);
    throw new Error("execSync not mocked for this test");
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

/** Run the CLI by dynamically importing cli.ts with the given argv */
async function runCLI(args: string[]) {
  process.argv = ["node", "cli.ts", ...args];
  vi.resetModules();
  // Re-apply mocks after resetModules
  vi.doMock("viem", async () => {
    const actual = await vi.importActual<typeof import("viem")>("viem");
    return {
      ...actual,
      createPublicClient: vi.fn(() => createMockPublicClient()),
      createWalletClient: vi.fn(() => mockWalletClient),
    };
  });
  vi.doMock("viem/accounts", () => ({
    privateKeyToAccount: vi.fn(() => ({ address: MOCK_WALLET, signMessage: vi.fn(), signTransaction: vi.fn() })),
    generatePrivateKey: vi.fn(() => MOCK_PK),
  }));
  vi.doMock("viem/chains", () => ({
    base: { id: 8453, name: "Base" },
  }));
  vi.doMock("child_process", () => ({
    execSync: vi.fn((cmd: string, opts?: any) => {
      if (mockExecSyncFn) return mockExecSyncFn(cmd, opts);
      throw new Error("execSync not mocked for this test");
    }),
  }));

  await import("../src/cli.ts");
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Last AI Standing CLI", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState = defaultMockState();
    writeContractCalls = [];
    mockWriteContract.mockClear();
    mockExecSyncFn = null;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("EXIT"); }) as any);
    process.env.BASE_PRIVATE_KEY = MOCK_PK;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    delete process.env.BASE_PRIVATE_KEY;
  });

  // ─── status ──────────────────────────────────────────────────────

  describe("status", () => {
    it("should display game state", async () => {
      await runCLI(["status"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toMatch(/Epoch.*#10/);
      expect(output).toMatch(/Alive.*5/);
      expect(output).toMatch(/Dead.*2/);
      expect(output).toContain("Pool:");
      expect(output).toContain("USDC");
    });
  });

  // ─── agents ────────────────────────────────────────────────────────

  describe("agents", () => {
    it("should display agent list", async () => {
      await runCLI(["agents"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("ARENA");
      expect(output).toContain("ALIVE");
      expect(output).toContain("42"); // agentId
    });

    it("should report no agents when registry is empty", async () => {
      mockState.registryLength = 0n;
      await runCLI(["agents"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("No agents");
    });
  });

  // ─── me ──────────────────────────────────────────────────────────

  describe("me", () => {
    it("should display agent status when registered and alive", async () => {
      await runCLI(["me"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("ALIVE");
      expect(output).toContain("42"); // agentId
      expect(output).toContain("USDC");
    });

    it("should show UNREGISTERED for new agents", async () => {
      mockState.isAlive = false;
      mockState.age = 0n;
      mockState.agents = { ...mockState.agents, alive: false, agentId: 0n };
      await runCLI(["me"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("UNREGISTERED");
    });

    it("should show DEAD for dead agents", async () => {
      mockState.isAlive = false;
      mockState.isKillable = false;
      mockState.age = 3n;
      mockState.agents = { ...mockState.agents, alive: false };
      await runCLI(["me"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("DEAD");
    });

    it("should fail without BASE_PRIVATE_KEY", async () => {
      delete process.env.BASE_PRIVATE_KEY;
      await expect(runCLI(["me"])).rejects.toThrow("EXIT");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("BASE_PRIVATE_KEY"));
    });
  });

  // ─── register ────────────────────────────────────────────────────

  describe("register", () => {
    it("should register with valid agentId", async () => {
      mockState.usdcAllowance = 0n; // triggers auto-approve
      await runCLI(["register", "42"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("approve");
      expect(fns).toContain("register");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Registered!");
    });

    it("should skip approval when allowance is sufficient", async () => {
      mockState.usdcAllowance = 999_999_999n;
      await runCLI(["register", "42"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).not.toContain("approve");
      expect(fns).toContain("register");
    });

    it("should fail when wallet doesn't match agentId", async () => {
      mockState.agentWallet = "0x0000000000000000000000000000000000000001";
      await expect(runCLI(["register", "42"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("not your wallet");
    });
  });

  // ─── heartbeat ───────────────────────────────────────────────────

  describe("heartbeat", () => {
    it("should send heartbeat with auto-approve", async () => {
      mockState.usdcAllowance = 0n;
      await runCLI(["heartbeat"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("approve");
      expect(fns).toContain("heartbeat");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Heartbeat sent!");
    });

    it("should skip approval if already approved", async () => {
      mockState.usdcAllowance = 999_999_999n;
      await runCLI(["heartbeat"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).not.toContain("approve");
      expect(fns).toContain("heartbeat");
    });
  });

  // ─── kill ────────────────────────────────────────────────────────

  describe("kill", () => {
    it("should kill a specific target", async () => {
      await runCLI(["kill", "0x0000000000000000000000000000000000000001"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("kill");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Killed");
    });

    it("should kill all killable agents", async () => {
      mockState.killableAddresses = [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ];
      await runCLI(["kill"]);
      const killCalls = writeContractCalls.filter(c => c.functionName === "kill");
      expect(killCalls).toHaveLength(2);
    });

    it("should report no killable agents", async () => {
      mockState.killableAddresses = [];
      await runCLI(["kill"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("No killable agents");
    });

    it("should report no agents when registry is empty", async () => {
      mockState.registryLength = 0n;
      await runCLI(["kill"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("No agents");
    });
  });

  // ─── claim ───────────────────────────────────────────────────────

  describe("claim", () => {
    it("should claim pending rewards", async () => {
      mockState.pendingReward = 50_000n;
      await runCLI(["claim"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("claim");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Claimed!");
    });

    it("should report nothing to claim when no rewards", async () => {
      mockState.pendingReward = 0n;
      await runCLI(["claim"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).not.toContain("claim");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Nothing to claim");
    });
  });

  // ─── approve ─────────────────────────────────────────────────────

  describe("approve", () => {
    it("should approve max USDC", async () => {
      await runCLI(["approve"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("approve");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Approved!");
    });
  });

  // ─── auto-approve flow ──────────────────────────────────────────

  describe("auto-approve flow", () => {
    it("should auto-approve when allowance < cost for register", async () => {
      mockState.usdcAllowance = COST_PER_EPOCH - 1n;
      await runCLI(["register", "42"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns[0]).toBe("approve");
      expect(fns[1]).toBe("register");
    });

    it("should not auto-approve when allowance >= cost", async () => {
      mockState.usdcAllowance = COST_PER_EPOCH;
      await runCLI(["register", "42"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).not.toContain("approve");
    });

    it("should auto-approve when allowance < cost for heartbeat", async () => {
      mockState.usdcAllowance = 0n;
      await runCLI(["heartbeat"]);
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns[0]).toBe("approve");
      expect(fns[1]).toBe("heartbeat");
    });
  });

  // ─── identity ─────────────────────────────────────────────────────

  describe("identity", () => {
    it("should show registered identity", async () => {
      mockState.identityAgentId = 42n;
      mockState.identityTokenURI = "https://example.com/agent.json";
      await runCLI(["identity"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("agentId: 42");
      expect(output).toContain("URI: https://example.com/agent.json");
    });

    it("should show not registered when agentId is 0", async () => {
      mockState.identityAgentId = 0n;
      await runCLI(["identity"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Not registered");
    });
  });

  // ─── identity register ──────────────────────────────────────────

  describe("identity register", () => {
    it("should register with --url", async () => {
      mockState.identityAgentId = 99n;
      await runCLI(["identity", "register", "--url", "https://example.com/agent.json"]);
      const identityCalls = writeContractCalls.filter(c => c.address === "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
      expect(identityCalls).toHaveLength(1);
      expect(identityCalls[0].functionName).toBe("register");
      expect(identityCalls[0].args![0]).toBe("https://example.com/agent.json");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Registered!");
      expect(output).toContain("agentId: 99");
    });

    it("should register with --name and --desc via gh gist", async () => {
      mockState.identityAgentId = 77n;
      mockExecSyncFn = (cmd: string) => {
        if (cmd === "which gh") return "/usr/bin/gh\n";
        if (cmd.includes("gh gist create")) return MOCK_GIST_URL + "\n";
        throw new Error(`Unexpected command: ${cmd}`);
      };
      await runCLI(["identity", "register", "--name", "TestAgent", "--desc", "A test agent"]);
      const identityCalls = writeContractCalls.filter(c => c.address === "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
      expect(identityCalls).toHaveLength(1);
      expect(identityCalls[0].args![0]).toContain("gist.githubusercontent.com");
      expect(identityCalls[0].args![0]).toContain("/raw/agent.json");
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Registered!");
      expect(output).toContain("agentId: 77");
    });

    it("should error when gh CLI is not available and no --url", async () => {
      mockExecSyncFn = (cmd: string) => {
        if (cmd === "which gh") throw new Error("not found");
        throw new Error(`Unexpected command: ${cmd}`);
      };
      await expect(runCLI(["identity", "register", "--name", "X", "--desc", "Y"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("gh CLI required");
    });

    it("should error when --name is missing without --url", async () => {
      mockExecSyncFn = (cmd: string) => {
        if (cmd === "which gh") return "/usr/bin/gh\n";
        throw new Error(`Unexpected command: ${cmd}`);
      };
      await expect(runCLI(["identity", "register", "--desc", "Y"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("--name required");
    });

    it("should error when --desc is missing without --url", async () => {
      mockExecSyncFn = (cmd: string) => {
        if (cmd === "which gh") return "/usr/bin/gh\n";
        throw new Error(`Unexpected command: ${cmd}`);
      };
      await expect(runCLI(["identity", "register", "--name", "X"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("--desc required");
    });
  });

  // ─── wallet ──────────────────────────────────────────────────────

  describe("wallet", () => {
    it("should show wallet address", async () => {
      await runCLI(["wallet"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain(MOCK_WALLET);
    });
  });

  describe("wallet new", () => {
    it("should generate and display a new wallet", async () => {
      delete process.env.BASE_PRIVATE_KEY; // wallet new doesn't need existing key
      await runCLI(["wallet", "new"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("SAVE THIS KEY SECURELY");
      expect(output).toContain(MOCK_WALLET); // from privateKeyToAccount mock
      expect(output).toContain(MOCK_PK);     // from generatePrivateKey mock
    });
  });

  describe("wallet balance", () => {
    it("should show ETH and USDC balances", async () => {
      await runCLI(["wallet", "balance"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain(MOCK_WALLET);
      expect(output).toContain("ETH:");
      expect(output).toContain("USDC:");
    });
  });

  // ─── swap ────────────────────────────────────────────────────────

  describe("swap", () => {
    it("should swap ETH to USDC", async () => {
      await runCLI(["swap", "eth", "usdc", "0.01"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Quote:");
      expect(output).toContain("Swapped!");
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("exactInputSingle");
    });

    it("should swap USDC to ETH with approve", async () => {
      mockState.usdcAllowance = 0n;
      await runCLI(["swap", "usdc", "eth", "5"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Quote:");
      expect(output).toContain("Swapped!");
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).toContain("approve");
      expect(fns).toContain("multicall");
    });

    it("should error for unsupported swap pair", async () => {
      await expect(runCLI(["swap", "btc", "eth", "1"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("Only ETH↔USDC");
    });

    it("should error when ETH balance is insufficient", async () => {
      mockState.ethBalance = 0n;
      await expect(runCLI(["swap", "eth", "usdc", "1"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("Insufficient ETH");
    });

    it("should error when USDC balance is insufficient", async () => {
      mockState.usdcBalance = 0n;
      await expect(runCLI(["swap", "usdc", "eth", "100"])).rejects.toThrow("EXIT");
      const errOutput = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(errOutput).toContain("Insufficient USDC");
    });
  });

  // ─── auto ────────────────────────────────────────────────────────

  describe("auto", () => {
    it("should run heartbeat + kill + claim when alive", async () => {
      mockState.usdcAllowance = 999_999_999n; // skip approve
      mockState.killableAddresses = ["0x0000000000000000000000000000000000000001"];
      mockState.pendingReward = 50_000n;
      await runCLI(["auto"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("♥"); // heartbeat
      expect(output).toContain("☠"); // kill
      expect(output).toContain("💰"); // claim
      expect(output).toContain("alive="); // summary
    });

    it("should exit early when not alive", async () => {
      mockState.isAlive = false;
      mockState.isKillable = false;
      await runCLI(["auto"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("Not alive");
      // Should NOT have sent heartbeat
      const fns = writeContractCalls.map(c => c.functionName);
      expect(fns).not.toContain("heartbeat");
    });

    it("should handle AlreadyHeartbeat gracefully", async () => {
      mockState.usdcAllowance = 999_999_999n;
      mockState.killableAddresses = [];
      mockState.pendingReward = 0n;
      // Make heartbeat throw AlreadyHeartbeat
      mockWriteContract.mockImplementationOnce(async (params: any) => {
        if (params.functionName === "heartbeat") {
          throw new Error("AlreadyHeartbeat");
        }
        writeContractCalls.push({ address: params.address, functionName: params.functionName });
        return MOCK_TX;
      });
      await runCLI(["auto"]);
      const output = consoleSpy.mock.calls.map(c => c.join(" ")).join("\n");
      expect(output).toContain("already sent");
    });
  });

  // ─── error cases ─────────────────────────────────────────────────

  describe("error cases", () => {
    it("should fail without BASE_PRIVATE_KEY for write commands", async () => {
      delete process.env.BASE_PRIVATE_KEY;
      for (const cmd of ["me", "heartbeat", "approve"]) {
        consoleSpy.mockClear();
        consoleErrorSpy.mockClear();
        try {
          await runCLI([cmd]);
        } catch (e: any) {
          expect(e.message).toBe("EXIT");
        }
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("BASE_PRIVATE_KEY"));
      }
    });
  });
});
