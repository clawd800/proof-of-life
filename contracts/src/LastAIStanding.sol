// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface for ERC-8004 Identity Registry
interface IERC8004 {
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @title LastAIStanding — Darwinian survival protocol for AI agents
/// @notice Agents pay COST_PER_EPOCH USDC per epoch to stay alive. Dead agents' funds go to survivors.
/// @dev Uses MasterChef-style reward accounting with age-weighted distribution.
///      Requires ERC-8004 agent identity for registration (agentId verification).
///      Gas-optimized: struct packing (4 slots), state packing, unchecked safe math.
///
/// TREASURY
/// --------
/// 10% of every payment (register + heartbeat) is diverted to a treasury.
/// The remaining 90% enters the survival pool for age-weighted distribution.
/// Treasury is claimable by the treasury wallet (defaults to deployer).
/// Treasury authority is transferable to another address.
///
/// PERPETUAL GAME
/// --------------
/// There are no rounds or endgame. The contract runs forever. When all agents
/// die, anyone (including previously dead agents) can register() to start a
/// new wave. Dead agents can re-register after claiming their rewards.
///
/// IDENTITY
/// --------
/// Each agent must hold a valid ERC-8004 agent identity. The contract verifies
/// that msg.sender matches the agentWallet registered in the ERC-8004 Identity
/// Registry at registration time. This links on-chain survival to agent identity,
/// enabling the frontend to display agent metadata (name, avatar) from tokenURI.
///
/// GAME THEORY
/// -----------
/// Rewards are distributed proportional to age (epochs survived). This creates
/// a first-mover advantage: early registrants accumulate rewards from every
/// death since genesis. Two agents with equal survival cost per epoch receive
/// equal per-epoch ROI, but the earlier agent has collected from more deaths.
///
/// Optimal strategy: register early, survive long.
///
/// KILL ORDER
/// ----------
/// When multiple agents die in the same epoch, the order in which kill() is
/// called affects reward distribution. A dead-but-not-yet-killed agent still
/// counts in totalAge, so it absorbs a share of rewards from agents killed
/// before it. These absorbed rewards become claimable by the dead agent.
///
/// This is intentional game mechanics:
///   - Incentivizes prompt kill() calls (less reward leaks to dead agents)
///   - Creates MEV-like opportunities for kill() callers
///   - Total USDC entering the pool is always conserved; only distribution shifts
///
/// LAST AGENT KILLED
/// -----------------
/// When the last alive agent is killed (totalAlive → 0), their totalPaid
/// cannot be distributed via accRewardPerAge (totalAge == 0). Instead, it is
/// returned to the agent as claimable. This ensures no USDC is permanently
/// stuck in the contract.
///
/// EDGE CASES
/// ----------
///   - Dead agents can claim rewards earned before death, then re-register.
///   - Rounding dust (1-2 wei) may accumulate due to integer division.
///   - registryLength() = unique agents; totalEverRegistered = total registration events.
///   - Re-registration uses the same agentId (cannot change identity between lives).
contract LastAIStanding is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────
    IERC20 public immutable usdc;
    IERC8004 public immutable identityRegistry;
    uint256 public immutable EPOCH_DURATION;
    uint256 public immutable COST_PER_EPOCH;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant TREASURY_BPS = 1000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ─── Agent State ─────────────────────────────────────────────────────
    /// @dev Packed into 4 storage slots.
    ///      Slot 0: birthEpoch(64) + lastHeartbeatEpoch(64) + alive(8) + totalPaid(96) = 232 bits
    ///      Slot 1: rewardDebt(256)
    ///      Slot 2: claimable(256)
    ///      Slot 3: agentId(256) — ERC-8004 identity, set once on first register
    struct Agent {
        uint64 birthEpoch;
        uint64 lastHeartbeatEpoch;
        bool alive;
        uint96 totalPaid;
        uint256 rewardDebt;
        uint256 claimable;
        uint256 agentId;
    }

    mapping(address => Agent) public agents;
    mapping(uint256 => address) public agentIdToAddr;
    address[] public registry;

    // ─── Global State ────────────────────────────────────────────────────
    /// @dev Packed: totalAlive + totalDead + totalEverRegistered in 1 slot (192 bits)
    uint64 public totalAlive;
    uint64 public totalDead;
    uint64 public totalEverRegistered;

    uint256 public totalAge; // sum of all living agents' current ages
    uint256 public accRewardPerAge; // accumulated reward per 1 unit of age (×PRECISION)

    // ─── Treasury ─────────────────────────────────────────────────────────
    address public treasury;
    uint256 public treasuryBalance;

    // ─── Stats ───────────────────────────────────────────────────────────
    uint256 public totalRewardsDistributed;

    // ─── Events ──────────────────────────────────────────────────────────
    event Born(address indexed agent, uint256 indexed agentId, uint256 epoch);
    event Heartbeat(address indexed agent, uint256 epoch, uint256 age);
    event Death(address indexed agent, uint256 indexed agentId, uint256 epoch, uint256 age, uint256 totalPaid);
    event Claimed(address indexed agent, uint256 amount);
    event TreasuryClaimed(address indexed treasury, uint256 amount);
    event TreasuryTransferred(address indexed oldTreasury, address indexed newTreasury);

    // ─── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyDead();
    error AlreadyHeartbeat();
    error MissedEpoch();
    error NotDeadYet();
    error NothingToClaim();
    error InvalidRange();
    error InvalidConfig();
    error NotAgentWallet();
    error AgentIdTaken();
    error NotTreasury();
    error ZeroAddress();

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor(address _usdc, address _identityRegistry, uint256 _epochDuration, uint256 _costPerEpoch) {
        if (_usdc == address(0)) revert InvalidConfig();
        if (_identityRegistry == address(0)) revert InvalidConfig();
        if (_epochDuration == 0) revert InvalidConfig();
        if (_costPerEpoch == 0 || _costPerEpoch > type(uint96).max) revert InvalidConfig();
        usdc = IERC20(_usdc);
        identityRegistry = IERC8004(_identityRegistry);
        EPOCH_DURATION = _epochDuration;
        COST_PER_EPOCH = _costPerEpoch;
        treasury = msg.sender;
    }

    // ─── Structs (View) ─────────────────────────────────────────────────
    struct AgentInfo {
        address addr;
        uint256 agentId;
        uint64 birthEpoch;
        uint64 lastHeartbeatEpoch;
        bool alive;
        bool killable;
        uint256 age;
        uint256 totalPaid;
        uint256 pendingReward;
    }

    // ─── Views ───────────────────────────────────────────────────────────

    /// @notice Current epoch number
    function currentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    /// @notice Agent's age in epochs (survival duration). Returns 0 only for unregistered addresses.
    /// @dev For dead agents, returns age at time of death (tombstone value).
    function getAge(address addr) public view returns (uint256) {
        Agent storage a = agents[addr];
        uint64 birth = a.birthEpoch;
        if (birth == 0) return 0;
        unchecked {
            return uint256(a.lastHeartbeatEpoch) - uint256(birth) + 1;
        }
    }

    /// @notice Whether agent is currently alive (accounts for missed epochs)
    function isAlive(address addr) public view returns (bool) {
        Agent storage a = agents[addr];
        if (!a.alive) return false;
        unchecked {
            return currentEpoch() <= uint256(a.lastHeartbeatEpoch) + 1;
        }
    }

    /// @notice Whether agent can be killed (missed their heartbeat window)
    function isKillable(address addr) public view returns (bool) {
        Agent storage a = agents[addr];
        if (!a.alive) return false;
        unchecked {
            return currentEpoch() > uint256(a.lastHeartbeatEpoch) + 1;
        }
    }

    /// @notice Pending claimable reward for an agent
    function pendingReward(address addr) public view returns (uint256) {
        Agent storage a = agents[addr];
        uint64 birth = a.birthEpoch;
        if (birth == 0) return 0;
        if (!a.alive) return a.claimable;
        uint256 _acc = accRewardPerAge;
        uint256 age;
        unchecked {
            age = uint256(a.lastHeartbeatEpoch) - uint256(birth) + 1;
        }
        return (age * _acc / PRECISION) - a.rewardDebt + a.claimable;
    }

    /// @notice Total USDC held in the contract (survival pool)
    function totalPool() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Total number of unique agents ever registered
    function registryLength() external view returns (uint256) {
        return registry.length;
    }

    /// @notice Get agent address by index
    function registryAt(uint256 index) external view returns (address) {
        return registry[index];
    }

    /// @notice Get a batch of agents with full info in a single RPC call
    /// @param startIndex The index of the first agent (inclusive)
    /// @param endIndex The index of the last agent (inclusive)
    /// @return agentList Array of AgentInfo structs
    function getAgentList(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (AgentInfo[] memory agentList) {
        uint256 len = registry.length;
        if (len == 0) return new AgentInfo[](0);
        if (startIndex > endIndex) revert InvalidRange();

        if (endIndex >= len) {
            endIndex = len - 1;
        }

        uint256 length;
        unchecked { length = endIndex - startIndex + 1; }
        agentList = new AgentInfo[](length);
        uint256 epoch = currentEpoch();
        uint256 _acc = accRewardPerAge;

        for (uint256 i; i < length;) {
            address addr;
            unchecked { addr = registry[startIndex + i]; }
            Agent storage a = agents[addr];

            uint64 birth = a.birthEpoch;
            uint64 lastHB = a.lastHeartbeatEpoch;
            bool alive_ = a.alive;

            bool killable_;
            uint256 age_;
            unchecked {
                killable_ = alive_ && epoch > uint256(lastHB) + 1;
                age_ = birth == 0 ? 0 : uint256(lastHB) - uint256(birth) + 1;
            }

            uint256 reward_;
            if (birth == 0) {
                reward_ = 0;
            } else if (!alive_) {
                reward_ = a.claimable;
            } else {
                reward_ = (age_ * _acc / PRECISION) - a.rewardDebt + a.claimable;
            }

            agentList[i] = AgentInfo({
                addr: addr,
                agentId: a.agentId,
                birthEpoch: birth,
                lastHeartbeatEpoch: lastHB,
                alive: alive_,
                killable: killable_,
                age: age_,
                totalPaid: a.totalPaid,
                pendingReward: reward_
            });
            unchecked { ++i; }
        }
    }

    /// @notice Get killable agents within a registry range
    /// @param startIndex The index of the first agent to check (inclusive)
    /// @param endIndex The index of the last agent to check (inclusive)
    /// @return killableList Array of addresses that can be killed in this range
    function getKillable(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (address[] memory) {
        uint256 len = registry.length;
        if (len == 0) return new address[](0);
        if (startIndex > endIndex) revert InvalidRange();

        if (endIndex >= len) {
            endIndex = len - 1;
        }

        uint256 epoch = currentEpoch();
        uint256 rangeLen;
        unchecked { rangeLen = endIndex - startIndex + 1; }

        // First pass: count killable in range
        uint256 count;
        for (uint256 i; i < rangeLen;) {
            Agent storage a = agents[registry[startIndex + i]];
            if (a.alive) {
                unchecked {
                    if (epoch > uint256(a.lastHeartbeatEpoch) + 1) ++count;
                }
            }
            unchecked { ++i; }
        }

        // Second pass: populate array
        address[] memory result = new address[](count);
        uint256 idx;
        for (uint256 i; i < rangeLen;) {
            address addr = registry[startIndex + i];
            Agent storage a = agents[addr];
            if (a.alive) {
                unchecked {
                    if (epoch > uint256(a.lastHeartbeatEpoch) + 1) {
                        result[idx] = addr;
                        if (++idx == count) break;
                    }
                }
            }
            unchecked { ++i; }
        }
        return result;
    }

    // ─── Actions ─────────────────────────────────────────────────────────

    /// @notice Register as a new agent. Requires valid ERC-8004 agent identity.
    /// @param agentId The ERC-8004 agent ID. msg.sender must be the registered agentWallet.
    /// @dev Caller must approve USDC before calling. Dead agents can re-register with the same agentId.
    function register(uint256 agentId) external nonReentrant {
        // Verify caller is the agentWallet for this agentId
        if (identityRegistry.getAgentWallet(agentId) != msg.sender) revert NotAgentWallet();

        // Prevent different wallets from registering the same agentId
        address existing = agentIdToAddr[agentId];
        if (existing != address(0) && existing != msg.sender) revert AgentIdTaken();

        Agent storage a = agents[msg.sender];
        if (a.alive) revert AlreadyRegistered();

        // Re-registering dead agent must use same agentId
        bool isNew = (a.birthEpoch == 0);
        if (!isNew && a.agentId != agentId) revert AgentIdTaken();

        uint256 epoch = currentEpoch();
        uint256 previousClaimable = a.claimable;
        uint256 _acc = accRewardPerAge;

        // Split payment: treasury takes 10%, pool gets 90%
        uint256 treasuryFee = COST_PER_EPOCH * TREASURY_BPS / BPS_DENOMINATOR;
        uint256 poolAmount = COST_PER_EPOCH - treasuryFee;
        treasuryBalance += treasuryFee;

        // Effects first (CEI pattern)
        agents[msg.sender] = Agent({
            birthEpoch: uint64(epoch),
            lastHeartbeatEpoch: uint64(epoch),
            alive: true,
            totalPaid: uint96(poolAmount),
            rewardDebt: _acc / PRECISION, // age = 1
            claimable: previousClaimable, // carry over unclaimed rewards from previous life
            agentId: agentId
        });

        if (isNew) {
            agentIdToAddr[agentId] = msg.sender;
            registry.push(msg.sender);
        }

        unchecked {
            totalAlive++;
            totalEverRegistered++;
        }
        totalAge += 1; // age starts at 1

        emit Born(msg.sender, agentId, epoch);

        // Interaction last
        usdc.safeTransferFrom(msg.sender, address(this), COST_PER_EPOCH);
    }

    /// @notice Pay COST_PER_EPOCH USDC to survive another epoch. Must call every epoch.
    function heartbeat() external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (a.birthEpoch == 0) revert NotRegistered();
        if (!a.alive) revert AlreadyDead();

        uint256 epoch = currentEpoch();
        uint64 lastHB = a.lastHeartbeatEpoch;
        if (epoch == uint256(lastHB)) revert AlreadyHeartbeat();
        unchecked {
            if (epoch > uint256(lastHB) + 1) revert MissedEpoch();
        }

        // Settle pending rewards BEFORE age changes
        uint256 _acc = accRewardPerAge;
        uint256 age;
        unchecked {
            age = uint256(lastHB) - uint256(a.birthEpoch) + 1;
        }
        uint256 pending = (age * _acc / PRECISION) - a.rewardDebt;

        // Split payment: treasury takes 10%, pool gets 90%
        uint256 treasuryFee = COST_PER_EPOCH * TREASURY_BPS / BPS_DENOMINATOR;
        uint256 poolAmount = COST_PER_EPOCH - treasuryFee;
        treasuryBalance += treasuryFee;

        // Effects: update all state before transfer
        unchecked {
            a.claimable += pending;
            a.totalPaid += uint96(poolAmount);
        }
        a.lastHeartbeatEpoch = uint64(epoch);

        uint256 newAge;
        unchecked {
            newAge = age + 1;
        }
        totalAge += 1;
        a.rewardDebt = (newAge * _acc) / PRECISION;

        emit Heartbeat(msg.sender, epoch, newAge);

        // Interaction last
        usdc.safeTransferFrom(msg.sender, address(this), COST_PER_EPOCH);
    }

    /// @notice Mark a dead agent and distribute their funds to survivors.
    /// @dev Permissionless — anyone can call. Agent is dead if they missed an epoch.
    function kill(address target) external {
        Agent storage a = agents[target];
        if (a.birthEpoch == 0) revert NotRegistered();
        if (!a.alive) revert AlreadyDead();

        uint256 epoch = currentEpoch();
        uint64 lastHB = a.lastHeartbeatEpoch;
        unchecked {
            if (epoch <= uint256(lastHB) + 1) revert NotDeadYet();
        }

        uint256 age;
        unchecked {
            age = uint256(lastHB) - uint256(a.birthEpoch) + 1;
        }

        // Settle dead agent's pending rewards (they can still claim these)
        uint256 _acc = accRewardPerAge;
        uint256 pending = (age * _acc / PRECISION) - a.rewardDebt;
        unchecked { a.claimable += pending; }
        a.rewardDebt = 0;

        // Mark dead
        a.alive = false;
        unchecked {
            totalAlive--;
            totalDead++;
        }
        totalAge -= age;

        // Dead agent's total paid USDC → reward pool for survivors.
        uint256 reward = a.totalPaid;
        uint256 _totalAge = totalAge;
        if (_totalAge > 0) {
            accRewardPerAge = _acc + (reward * PRECISION) / _totalAge;
        } else {
            unchecked { a.claimable += reward; }
        }
        unchecked { totalRewardsDistributed += reward; }

        emit Death(target, a.agentId, epoch, age, reward);
    }

    /// @notice Claim accumulated treasury fees. Only callable by treasury wallet.
    function claimTreasury() external nonReentrant {
        if (msg.sender != treasury) revert NotTreasury();
        uint256 amount = treasuryBalance;
        if (amount == 0) revert NothingToClaim();
        treasuryBalance = 0;
        emit TreasuryClaimed(msg.sender, amount);
        usdc.safeTransfer(treasury, amount);
    }

    /// @notice Transfer treasury authority to a new wallet. Only callable by current treasury.
    function transferTreasury(address newTreasury) external {
        if (msg.sender != treasury) revert NotTreasury();
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryTransferred(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Claim accumulated rewards.
    /// @dev Living agents claim ongoing rewards. Dead agents claim what they earned before death.
    function claim() external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (a.birthEpoch == 0) revert NotRegistered();

        uint256 payout;
        if (a.alive) {
            uint256 _acc = accRewardPerAge;
            uint256 age;
            unchecked {
                age = uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1;
            }
            payout = (age * _acc / PRECISION) - a.rewardDebt + a.claimable;
            a.rewardDebt = (age * _acc) / PRECISION;
        } else {
            payout = a.claimable;
        }

        // Effects before interaction
        a.claimable = 0;
        if (payout == 0) revert NothingToClaim();

        emit Claimed(msg.sender, payout);

        // Interaction last
        usdc.safeTransfer(msg.sender, payout);
    }
}
