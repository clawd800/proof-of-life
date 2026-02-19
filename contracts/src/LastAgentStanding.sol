// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LastAgentStanding — Darwinian survival protocol for AI agents
/// @notice Agents pay 1 USDC/epoch to stay alive. Dead agents' funds go to survivors.
/// @dev Uses MasterChef-style reward accounting with age-weighted distribution.
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
/// ENDGAME
/// -------
/// When the last alive agent is killed (totalAlive → 0), they are the winner.
/// Instead of their totalPaid being stuck, they receive the entire remaining
/// USDC balance in the contract (their own payments + any rounding dust).
/// The winner can call claim() to withdraw their prize.
///
/// EDGE CASES
/// ----------
///   - Dead agents can claim rewards earned before death, but cannot re-register.
///   - Rounding dust (1-2 wei) may accumulate due to integer division.
contract LastAgentStanding is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────
    IERC20 public immutable usdc;
    uint256 public constant EPOCH_DURATION = 1 hours;
    uint256 public constant COST_PER_EPOCH = 1e6; // 1 USDC (6 decimals)
    uint256 public constant PRECISION = 1e18;

    // ─── Agent State ─────────────────────────────────────────────────────
    struct Agent {
        uint64 birthEpoch;
        uint64 lastHeartbeatEpoch;
        bool alive;
        uint256 totalPaid;
        uint256 rewardDebt;
        uint256 claimable;
    }

    mapping(address => Agent) public agents;
    address[] public registry;

    // ─── Global State ────────────────────────────────────────────────────
    uint256 public totalAlive;
    uint256 public totalAge; // sum of all living agents' current ages
    uint256 public accRewardPerAge; // accumulated reward per 1 unit of age (×PRECISION)

    // ─── Stats ───────────────────────────────────────────────────────────
    uint256 public totalEverRegistered;
    uint256 public totalDead;
    uint256 public totalRewardsDistributed;

    // ─── Events ──────────────────────────────────────────────────────────
    event Born(address indexed agent, uint256 epoch);
    event Heartbeat(address indexed agent, uint256 epoch, uint256 age);
    event Death(address indexed agent, uint256 epoch, uint256 age, uint256 totalPaid);
    event Claimed(address indexed agent, uint256 amount);
    event Winner(address indexed agent, uint256 epoch, uint256 age, uint256 prize);

    // ─── Errors ──────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyDead();
    error AlreadyHeartbeat();
    error MissedEpoch();
    error NotDeadYet();
    error NothingToClaim();
    error InvalidRange();

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    // ─── Structs (View) ─────────────────────────────────────────────────
    struct AgentInfo {
        address addr;
        uint64 birthEpoch;
        uint64 lastHeartbeatEpoch;
        bool alive;
        bool killable;
        uint256 age;
        uint256 totalPaid;
        uint256 pendingReward;
    }

    // ─── Views ───────────────────────────────────────────────────────────

    /// @notice Current epoch number (hours since Unix epoch)
    function currentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    /// @notice Agent's current age in epochs (0 if dead)
    function getAge(address addr) public view returns (uint256) {
        Agent storage a = agents[addr];
        if (!a.alive) return 0;
        return a.lastHeartbeatEpoch - a.birthEpoch + 1;
    }

    /// @notice Whether agent is currently alive (accounts for missed epochs)
    function isAlive(address addr) public view returns (bool) {
        Agent storage a = agents[addr];
        if (!a.alive) return false;
        return currentEpoch() <= uint256(a.lastHeartbeatEpoch) + 1;
    }

    /// @notice Whether agent can be killed (missed their heartbeat window)
    function isKillable(address addr) public view returns (bool) {
        Agent storage a = agents[addr];
        if (!a.alive) return false;
        return currentEpoch() > uint256(a.lastHeartbeatEpoch) + 1;
    }

    /// @notice Pending claimable reward for an agent
    function pendingReward(address addr) public view returns (uint256) {
        Agent storage a = agents[addr];
        if (a.birthEpoch == 0) return 0;
        if (!a.alive) return a.claimable;
        uint256 age = uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1;
        return (age * accRewardPerAge / PRECISION) - a.rewardDebt + a.claimable;
    }

    /// @notice Total USDC held in the contract (survival pool)
    function totalPool() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Total number of agents ever registered
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
        if (registry.length == 0) return new AgentInfo[](0);
        if (startIndex > endIndex) revert InvalidRange();

        if (endIndex >= registry.length) {
            endIndex = registry.length - 1;
        }

        uint256 length = endIndex - startIndex + 1;
        agentList = new AgentInfo[](length);
        uint256 epoch = currentEpoch();

        for (uint256 i = 0; i < length; i++) {
            address addr = registry[startIndex + i];
            Agent storage a = agents[addr];

            bool alive_ = a.alive;
            bool killable_ = alive_ && epoch > uint256(a.lastHeartbeatEpoch) + 1;
            uint256 age_ = alive_
                ? uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1
                : 0;

            uint256 reward_;
            if (a.birthEpoch == 0) {
                reward_ = 0;
            } else if (!alive_) {
                reward_ = a.claimable;
            } else {
                reward_ = (age_ * accRewardPerAge / PRECISION) - a.rewardDebt + a.claimable;
            }

            agentList[i] = AgentInfo({
                addr: addr,
                birthEpoch: a.birthEpoch,
                lastHeartbeatEpoch: a.lastHeartbeatEpoch,
                alive: alive_,
                killable: killable_,
                age: age_,
                totalPaid: a.totalPaid,
                pendingReward: reward_
            });
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
        if (registry.length == 0) return new address[](0);
        if (startIndex > endIndex) revert InvalidRange();

        if (endIndex >= registry.length) {
            endIndex = registry.length - 1;
        }

        uint256 epoch = currentEpoch();
        uint256 rangeLen = endIndex - startIndex + 1;

        // First pass: count killable in range
        uint256 count = 0;
        for (uint256 i = 0; i < rangeLen; i++) {
            Agent storage a = agents[registry[startIndex + i]];
            if (a.alive && epoch > uint256(a.lastHeartbeatEpoch) + 1) {
                count++;
            }
        }

        // Second pass: populate array
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < rangeLen && idx < count; i++) {
            address addr = registry[startIndex + i];
            Agent storage a = agents[addr];
            if (a.alive && epoch > uint256(a.lastHeartbeatEpoch) + 1) {
                result[idx++] = addr;
            }
        }
        return result;
    }

    // ─── Actions ─────────────────────────────────────────────────────────

    /// @notice Register as a new agent. Costs 1 USDC (covers first epoch).
    /// @dev Caller must approve USDC before calling.
    function register() external nonReentrant {
        if (agents[msg.sender].birthEpoch != 0) revert AlreadyRegistered();

        uint256 epoch = currentEpoch();

        // Effects first (CEI pattern)
        agents[msg.sender] = Agent({
            birthEpoch: uint64(epoch),
            lastHeartbeatEpoch: uint64(epoch),
            alive: true,
            totalPaid: COST_PER_EPOCH,
            rewardDebt: (1 * accRewardPerAge) / PRECISION,
            claimable: 0
        });

        totalAlive++;
        totalAge += 1; // age starts at 1
        totalEverRegistered++;
        registry.push(msg.sender);

        emit Born(msg.sender, epoch);

        // Interaction last
        usdc.safeTransferFrom(msg.sender, address(this), COST_PER_EPOCH);
    }

    /// @notice Pay 1 USDC to survive another epoch. Must call every epoch.
    function heartbeat() external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (a.birthEpoch == 0) revert NotRegistered();
        if (!a.alive) revert AlreadyDead();

        uint256 epoch = currentEpoch();
        if (epoch == uint256(a.lastHeartbeatEpoch)) revert AlreadyHeartbeat();
        if (epoch > uint256(a.lastHeartbeatEpoch) + 1) revert MissedEpoch();

        // Settle pending rewards BEFORE age changes
        uint256 age = uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1;
        uint256 pending = (age * accRewardPerAge / PRECISION) - a.rewardDebt;
        a.claimable += pending;

        // Effects: update all state before transfer
        a.totalPaid += COST_PER_EPOCH;
        a.lastHeartbeatEpoch = uint64(epoch);

        uint256 newAge = age + 1;
        totalAge += 1;
        a.rewardDebt = (newAge * accRewardPerAge) / PRECISION;

        emit Heartbeat(msg.sender, epoch, newAge);

        // Interaction last
        usdc.safeTransferFrom(msg.sender, address(this), COST_PER_EPOCH);
    }

    /// @notice Mark a dead agent and distribute their funds to survivors.
    /// @dev Permissionless — anyone can call. Agent is dead if they missed an epoch.
    ///      When multiple agents die in the same epoch, kill order matters:
    ///      dead-but-not-yet-killed agents still count in totalAge and absorb
    ///      a share of rewards from earlier kills. This is by design — it
    ///      incentivizes callers to process kills promptly.
    function kill(address target) external {
        Agent storage a = agents[target];
        if (!a.alive) revert AlreadyDead();

        uint256 epoch = currentEpoch();
        if (epoch <= uint256(a.lastHeartbeatEpoch) + 1) revert NotDeadYet();

        uint256 age = uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1;

        // Settle dead agent's pending rewards (they can still claim these)
        uint256 pending = (age * accRewardPerAge / PRECISION) - a.rewardDebt;
        a.claimable += pending;
        a.rewardDebt = 0;

        // Mark dead
        a.alive = false;
        totalAlive--;
        totalAge -= age;
        totalDead++;

        // Dead agent's total paid USDC → reward pool for survivors.
        // If totalAge == 0 (last agent standing), they win and get their own funds back.
        uint256 reward = a.totalPaid;
        if (totalAge > 0) {
            accRewardPerAge += (reward * PRECISION) / totalAge;
        } else {
            // Last agent standing — winner gets the entire remaining pool.
            // Using = (not +=) because settled pending rewards above are
            // already part of the contract balance. This avoids double-counting.
            a.claimable = usdc.balanceOf(address(this));
            emit Winner(target, epoch, age, a.claimable);
        }
        totalRewardsDistributed += reward;

        emit Death(target, epoch, age, reward);
    }

    /// @notice Claim accumulated rewards.
    /// @dev Living agents claim ongoing rewards. Dead agents claim what they earned before death.
    function claim() external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (a.birthEpoch == 0) revert NotRegistered();

        uint256 payout;
        if (a.alive) {
            uint256 age = uint256(a.lastHeartbeatEpoch) - uint256(a.birthEpoch) + 1;
            payout = (age * accRewardPerAge / PRECISION) - a.rewardDebt + a.claimable;
            a.rewardDebt = (age * accRewardPerAge) / PRECISION;
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
