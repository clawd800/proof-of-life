// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {LastAIStanding, IERC8004} from "../src/LastAIStanding.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Mock ERC-8004 Identity Registry for testing
contract MockERC8004 {
    mapping(uint256 => address) private _wallets;
    uint256 private _nextId;

    /// @dev Register a wallet and return its agentId
    function mockRegister(address wallet) external returns (uint256 agentId) {
        agentId = _nextId++;
        _wallets[agentId] = wallet;
    }

    /// @dev Set wallet for a specific agentId (for re-assignment tests)
    function mockSetWallet(uint256 agentId, address wallet) external {
        _wallets[agentId] = wallet;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _wallets[agentId];
    }
}

contract LastAIStandingTest is Test {
    LastAIStanding public pol;
    MockUSDC public usdc;
    MockERC8004 public registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");
    address dave = makeAddr("dave");
    address killer = makeAddr("killer");

    // ERC-8004 agent IDs
    uint256 aliceId;
    uint256 bobId;
    uint256 charlieId;
    uint256 daveId;

    uint256 constant USDC_1 = 1e6;
    uint256 constant POOL_AMOUNT = USDC_1 * 9 / 10; // 900000 — 90% after treasury
    uint256 constant TREASURY_FEE = USDC_1 / 10;    // 100000 — 10% treasury
    uint256 constant EPOCH = 1 hours;

    function setUp() public {
        vm.warp(1_000_000 * EPOCH);

        usdc = new MockUSDC();
        registry = new MockERC8004();
        pol = new LastAIStanding(address(usdc), address(registry), 1 hours, 1e6);

        // Register agents in ERC-8004 mock
        aliceId = registry.mockRegister(alice);
        bobId = registry.mockRegister(bob);
        charlieId = registry.mockRegister(charlie);
        daveId = registry.mockRegister(dave);

        // Fund agents
        address[4] memory agents = [alice, bob, charlie, dave];
        for (uint256 i = 0; i < 4; i++) {
            usdc.mint(agents[i], 1000 * USDC_1);
            vm.prank(agents[i]);
            usdc.approve(address(pol), type(uint256).max);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _register(address agent, uint256 agentId) internal {
        vm.prank(agent);
        pol.register(agentId);
    }

    function _heartbeat(address agent) internal {
        vm.prank(agent);
        pol.heartbeat();
    }

    function _advanceEpoch() internal {
        vm.warp(block.timestamp + EPOCH);
    }

    // ─── Registration ────────────────────────────────────────────────────

    function test_register() public {
        _register(alice, aliceId);

        assertEq(pol.totalAlive(), 1);
        assertEq(pol.totalAge(), 1);
        assertEq(pol.totalEverRegistered(), 1);
        assertEq(pol.getAge(alice), 1);
        assertTrue(pol.isAlive(alice));
        assertEq(usdc.balanceOf(address(pol)), USDC_1);
    }

    function test_register_storesAgentId() public {
        _register(alice, aliceId);

        (,,,,,,uint256 storedId) = pol.agents(alice);
        assertEq(storedId, aliceId);
        assertEq(pol.agentIdToAddr(aliceId), alice);
    }

    function test_register_wrongWalletReverts() public {
        // Bob tries to register with Alice's agentId
        vm.expectRevert(LastAIStanding.NotAgentWallet.selector);
        vm.prank(bob);
        pol.register(aliceId);
    }

    function test_register_agentIdTakenByOtherReverts() public {
        _register(alice, aliceId);

        // Change agentWallet in mock so bob's wallet is now linked to aliceId
        registry.mockSetWallet(aliceId, bob);

        // Bob tries to register with aliceId — but it's already mapped to alice
        vm.expectRevert(LastAIStanding.AgentIdTaken.selector);
        vm.prank(bob);
        pol.register(aliceId);
    }

    function test_register_whileAliveReverts() public {
        _register(alice, aliceId);
        vm.expectRevert(LastAIStanding.AlreadyRegistered.selector);
        _register(alice, aliceId);
    }

    // ─── Heartbeat ───────────────────────────────────────────────────────

    function test_heartbeat() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _heartbeat(alice);

        assertEq(pol.getAge(alice), 2);
        assertEq(pol.totalAge(), 2);
        assertEq(usdc.balanceOf(address(pol)), 2 * USDC_1);
    }

    function test_heartbeat_sameEpochReverts() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _heartbeat(alice);

        vm.expectRevert(LastAIStanding.AlreadyHeartbeat.selector);
        _heartbeat(alice);
    }

    function test_heartbeat_missedEpochReverts() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _advanceEpoch();

        vm.expectRevert(LastAIStanding.MissedEpoch.selector);
        _heartbeat(alice);
    }

    // ─── Death ───────────────────────────────────────────────────────────

    function test_kill() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        assertFalse(pol.isAlive(alice));
        assertEq(pol.getAge(alice), 1);
        assertEq(pol.totalAlive(), 0);
        assertEq(pol.totalDead(), 1);
    }

    function test_kill_notDeadYetReverts() public {
        _register(alice, aliceId);
        _advanceEpoch();

        vm.expectRevert(LastAIStanding.NotDeadYet.selector);
        vm.prank(killer);
        pol.kill(alice);
    }

    function test_kill_alreadyDeadReverts() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        vm.expectRevert(LastAIStanding.AlreadyDead.selector);
        vm.prank(killer);
        pol.kill(alice);
    }

    // ─── Rewards ─────────────────────────────────────────────────────────

    function test_rewardDistribution_simple() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        uint256 reward = usdc.balanceOf(alice) - balBefore;

        assertApproxEqAbs(reward, POOL_AMOUNT, 1);
    }

    function test_rewardDistribution_multipleAgents() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        assertApproxEqAbs(aliceReward, 450000, 1);  // 900000 / 2
        assertApproxEqAbs(bobReward, 450000, 1);    // 900000 / 2
        assertApproxEqAbs(aliceReward + bobReward, POOL_AMOUNT, 2);
    }

    function test_rewardDistribution_ageWeighted() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);
        _register(bob, bobId);

        _register(charlie, charlieId);
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        assertEq(aliceReward, 562500);  // 5/8 * 900000
        assertEq(bobReward, 337500);   // 3/8 * 900000
        assertEq(aliceReward + bobReward, POOL_AMOUNT);
    }

    function test_deadAgentCanClaimEarnedRewards() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);

        uint256 bobClaimable = pol.pendingReward(bob);
        assertTrue(bobClaimable > 0, "Dead bob should have claimable rewards");

        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        uint256 bobReceived = usdc.balanceOf(bob) - bobBalBefore;
        assertEq(bobReceived, bobClaimable);
    }

    function test_multipleDeath_sequential() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);
        _register(dave, daveId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);
        _heartbeat(dave);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);
        vm.prank(killer);
        pol.kill(dave);

        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        assertTrue(aliceReward > 0);
        assertTrue(bobReward > 0);
        uint256 daveClaimable = pol.pendingReward(dave);
        uint256 charlieClaimable = pol.pendingReward(charlie);
        assertApproxEqAbs(
            aliceReward + bobReward + daveClaimable + charlieClaimable,
            4 * POOL_AMOUNT,
            4
        );
    }

    // ─── Edge Cases ──────────────────────────────────────────────────────

    function test_singleAgent_neverDies() public {
        _register(alice, aliceId);

        for (uint256 i = 0; i < 10; i++) {
            _advanceEpoch();
            _heartbeat(alice);
        }

        assertEq(pol.getAge(alice), 11);
        assertEq(pol.totalAlive(), 1);
        assertEq(pol.pendingReward(alice), 0);
    }

    // ─── Last AI Standing ────────────────────────────────────────────────

    function test_lastAgentStanding_winsOwnFundsBack() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);
        vm.prank(killer);
        pol.kill(charlie);

        vm.prank(alice);
        pol.claim();

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        assertEq(pol.totalAlive(), 0);
        uint256 alicePending = pol.pendingReward(alice);
        assertEq(alicePending, 4 * POOL_AMOUNT, "Winner gets own totalPaid back");

        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, 4 * POOL_AMOUNT);
    }

    function test_lastAgentStanding_twoAgentSimple() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);

        vm.prank(alice);
        pol.claim();

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, 3 * POOL_AMOUNT);
    }

    function test_lastAgentStanding_simultaneousDeath() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);
        vm.prank(killer);
        pol.kill(bob);

        assertEq(pol.totalAlive(), 0);

        uint256 bobPending = pol.pendingReward(bob);
        assertEq(bobPending, 2 * POOL_AMOUNT);

        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        assertEq(usdc.balanceOf(bob) - bobBalBefore, 2 * POOL_AMOUNT);

        // Only treasury fees remain in contract
        assertEq(usdc.balanceOf(address(pol)), pol.treasuryBalance());
    }

    function test_lastAgentStanding_doesNotStealUnclaimedRewards() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();

        vm.prank(killer);
        pol.kill(bob);

        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        uint256 bobPending = pol.pendingReward(bob);
        assertTrue(bobPending > 0, "Bob should have unclaimed rewards");

        uint256 alicePending = pol.pendingReward(alice);

        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        assertEq(usdc.balanceOf(bob) - bobBalBefore, bobPending);

        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, alicePending);
    }

    function test_registryTracking() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        assertEq(pol.registryLength(), 3);
        assertEq(pol.registryAt(0), alice);
        assertEq(pol.registryAt(1), bob);
        assertEq(pol.registryAt(2), charlie);
    }

    function test_claim_notRegisteredReverts() public {
        vm.expectRevert(LastAIStanding.NotRegistered.selector);
        vm.prank(alice);
        pol.claim();
    }

    function test_claim_nothingReverts() public {
        _register(alice, aliceId);

        vm.expectRevert(LastAIStanding.NothingToClaim.selector);
        vm.prank(alice);
        pol.claim();
    }

    // ─── Heartbeat error paths ───────────────────────────────────────────

    function test_heartbeat_notRegisteredReverts() public {
        vm.expectRevert(LastAIStanding.NotRegistered.selector);
        _heartbeat(alice);
    }

    function test_heartbeat_deadReverts() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        _advanceEpoch();
        vm.expectRevert(LastAIStanding.AlreadyDead.selector);
        _heartbeat(alice);
    }

    function test_heartbeat_sameEpochAsRegisterReverts() public {
        _register(alice, aliceId);

        vm.expectRevert(LastAIStanding.AlreadyHeartbeat.selector);
        _heartbeat(alice);
    }

    // ─── Kill edge cases ─────────────────────────────────────────────────

    function test_kill_unregisteredReverts() public {
        vm.expectRevert(LastAIStanding.NotRegistered.selector);
        vm.prank(killer);
        pol.kill(alice);
    }

    // ─── View functions for unregistered ──────────────────────────────────

    function test_getAge_unregistered() public view {
        assertEq(pol.getAge(alice), 0);
    }

    function test_isAlive_unregistered() public view {
        assertFalse(pol.isAlive(alice));
    }

    function test_isKillable_unregistered() public view {
        assertFalse(pol.isKillable(alice));
    }

    function test_pendingReward_unregistered() public view {
        assertEq(pol.pendingReward(alice), 0);
    }

    // ─── isKillable ──────────────────────────────────────────────────────

    function test_isKillable() public {
        _register(alice, aliceId);
        assertFalse(pol.isKillable(alice));

        _advanceEpoch();
        assertFalse(pol.isKillable(alice));

        _advanceEpoch();
        assertTrue(pol.isKillable(alice));

        vm.prank(killer);
        pol.kill(alice);
        assertFalse(pol.isKillable(alice));
    }

    // ─── totalPool ───────────────────────────────────────────────────────

    function test_totalPool() public {
        assertEq(pol.totalPool(), 0);

        _register(alice, aliceId);
        assertEq(pol.totalPool(), USDC_1);

        _advanceEpoch();
        _heartbeat(alice);
        assertEq(pol.totalPool(), 2 * USDC_1);
    }

    // ─── getAgentList ────────────────────────────────────────────────────

    function test_getAgentList_empty() public view {
        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 0);
        assertEq(list.length, 0);
    }

    function test_getAgentList_basic() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 2);
        assertEq(list.length, 3);
        assertEq(list[0].addr, alice);
        assertEq(list[0].agentId, aliceId);
        assertEq(list[1].addr, bob);
        assertEq(list[1].agentId, bobId);
        assertEq(list[2].addr, charlie);
        assertTrue(list[0].alive);
        assertEq(list[0].age, 1);
        assertFalse(list[0].killable);
    }

    function test_getAgentList_clampsEndIndex() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 100);
        assertEq(list.length, 2);
    }

    function test_getAgentList_partial() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(1, 2);
        assertEq(list.length, 2);
        assertEq(list[0].addr, bob);
        assertEq(list[1].addr, charlie);
    }

    function test_getAgentList_invalidRangeReverts() public {
        _register(alice, aliceId);

        vm.expectRevert(LastAIStanding.InvalidRange.selector);
        pol.getAgentList(2, 0);
    }

    function test_getAgentList_withKillable() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 1);
        assertFalse(list[0].killable);
        assertTrue(list[1].killable);
    }

    function test_getAgentList_deadAgent() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 0);
        assertEq(list.length, 1);
        assertFalse(list[0].alive);
        assertEq(list[0].age, 1);
    }

    // ─── getKillable ─────────────────────────────────────────────────────

    function test_getKillable_none() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        address[] memory k = pol.getKillable(0, 1);
        assertEq(k.length, 0);
    }

    function test_getKillable_some() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        address[] memory k = pol.getKillable(0, 2);
        assertEq(k.length, 2);
        assertEq(k[0], bob);
        assertEq(k[1], charlie);
    }

    function test_getKillable_partial() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _advanceEpoch();

        address[] memory k = pol.getKillable(1, 2);
        assertEq(k.length, 2);
    }

    function test_getKillable_clampsEndIndex() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();

        address[] memory k = pol.getKillable(0, 100);
        assertEq(k.length, 1);
    }

    function test_getKillable_empty() public view {
        address[] memory k = pol.getKillable(0, 0);
        assertEq(k.length, 0);
    }

    function test_getKillable_invalidRangeReverts() public {
        _register(alice, aliceId);

        vm.expectRevert(LastAIStanding.InvalidRange.selector);
        pol.getKillable(2, 0);
    }

    function test_getKillable_afterKill() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        address[] memory k = pol.getKillable(0, 1);
        assertEq(k.length, 1);
        assertEq(k[0], bob);
    }

    // ─── Multiple claims ─────────────────────────────────────────────────

    function test_claim_multipleTimes() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        uint256 reward1 = pol.pendingReward(alice);
        assertTrue(reward1 > 0);
        vm.prank(alice);
        pol.claim();
        assertEq(pol.pendingReward(alice), 0);

        _advanceEpoch();
        _heartbeat(alice);
        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);

        uint256 reward2 = pol.pendingReward(alice);
        assertTrue(reward2 > 0);
        vm.prank(alice);
        pol.claim();
        assertEq(pol.pendingReward(alice), 0);
    }

    // ─── isAlive timing edge ─────────────────────────────────────────────

    function test_isAlive_graceWindow() public {
        _register(alice, aliceId);
        assertTrue(pol.isAlive(alice));

        _advanceEpoch();
        assertTrue(pol.isAlive(alice));

        _advanceEpoch();
        assertFalse(pol.isAlive(alice));
        assertTrue(pol.isKillable(alice));
    }

    // ─── Re-registration ─────────────────────────────────────────────────

    function test_reregister_basic() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        _register(alice, aliceId);

        assertTrue(pol.isAlive(alice));
        assertEq(pol.getAge(alice), 1);
        assertEq(pol.totalAlive(), 1);
        assertEq(pol.totalEverRegistered(), 2);
        assertEq(pol.registryLength(), 1);
    }

    function test_reregister_differentAgentIdReverts() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        // Create new agentId for alice in mock
        uint256 newId = registry.mockRegister(alice);

        // Re-register with different agentId should fail
        vm.expectRevert(LastAIStanding.AgentIdTaken.selector);
        vm.prank(alice);
        pol.register(newId);
    }

    function test_reregister_preservesClaimable_v2() public {
        _register(alice, aliceId);
        _register(bob, bobId);
        _register(charlie, charlieId);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(charlie);

        uint256 aliceRewardBeforeDeath = pol.pendingReward(alice);
        assertTrue(aliceRewardBeforeDeath > 0);

        _advanceEpoch();
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(alice);

        uint256 aliceClaimableAfterDeath = pol.pendingReward(alice);
        assertTrue(aliceClaimableAfterDeath > 0);

        _register(alice, aliceId);

        uint256 alicePendingAfterReregister = pol.pendingReward(alice);
        assertEq(alicePendingAfterReregister, aliceClaimableAfterDeath,
            "Claimable from previous life should carry over");

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - balBefore, aliceClaimableAfterDeath);
    }

    function test_reregister_noRegistryDuplicate() public {
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        _register(alice, aliceId);

        assertEq(pol.registryLength(), 1);
        assertEq(pol.registryAt(0), alice);
    }

    function test_reregister_fullLifecycle() public {
        for (uint256 life = 0; life < 3; life++) {
            _register(alice, aliceId);
            assertTrue(pol.isAlive(alice));

            _advanceEpoch();
            _heartbeat(alice);
            _advanceEpoch();
            _heartbeat(alice);

            _advanceEpoch();
            _advanceEpoch();
            vm.prank(killer);
            pol.kill(alice);

            assertFalse(pol.isAlive(alice));
        }

        assertEq(pol.totalEverRegistered(), 3);
        assertEq(pol.registryLength(), 1);
        assertEq(pol.totalDead(), 3);
    }

    function test_reregister_perpetualGame() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(bob);

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        assertEq(pol.totalAlive(), 0);

        vm.prank(alice);
        pol.claim();

        _register(bob, bobId);
        _register(charlie, charlieId);

        assertEq(pol.totalAlive(), 2);

        _advanceEpoch();
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(charlie);

        assertApproxEqAbs(pol.pendingReward(bob), POOL_AMOUNT, 1);
    }

    function test_reregister_contractDrainsToZero() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(bob);
        vm.prank(killer);
        pol.kill(alice);

        vm.prank(alice);
        pol.claim();

        // Only treasury fees remain (3 payments × 100000 = 300000)
        assertApproxEqAbs(usdc.balanceOf(address(pol)), pol.treasuryBalance(), 2);
    }

    // ─── ERC-8004 Identity Tests ─────────────────────────────────────────

    function test_identity_agentIdInEvents() public {
        vm.expectEmit(true, true, false, true);
        emit LastAIStanding.Born(alice, aliceId, pol.currentEpoch());
        _register(alice, aliceId);

        _advanceEpoch();
        _advanceEpoch();

        vm.expectEmit(true, true, false, true);
        emit LastAIStanding.Death(alice, aliceId, pol.currentEpoch(), 1, POOL_AMOUNT);
        vm.prank(killer);
        pol.kill(alice);
    }

    function test_identity_agentIdToAddr() public {
        _register(alice, aliceId);
        _register(bob, bobId);

        assertEq(pol.agentIdToAddr(aliceId), alice);
        assertEq(pol.agentIdToAddr(bobId), bob);
        assertEq(pol.agentIdToAddr(999), address(0)); // unregistered
    }

    function test_identity_walletMustMatch() public {
        // Eve has no ERC-8004 registration
        address eve = makeAddr("eve");
        usdc.mint(eve, 100 * USDC_1);
        vm.prank(eve);
        usdc.approve(address(pol), type(uint256).max);

        // Eve tries to register with alice's agentId
        vm.expectRevert(LastAIStanding.NotAgentWallet.selector);
        vm.prank(eve);
        pol.register(aliceId);

        // Eve tries non-existent agentId
        vm.expectRevert(LastAIStanding.NotAgentWallet.selector);
        vm.prank(eve);
        pol.register(999);
    }

    // ─── Treasury Tests ────────────────────────────────────────────────

    function test_treasury_defaultsToDeployer() public view {
        assertEq(pol.treasury(), address(this));
    }

    function test_treasury_accruesOnRegister() public {
        assertEq(pol.treasuryBalance(), 0);
        _register(alice, aliceId);
        assertEq(pol.treasuryBalance(), TREASURY_FEE);
    }

    function test_treasury_accruesOnHeartbeat() public {
        _register(alice, aliceId);
        assertEq(pol.treasuryBalance(), TREASURY_FEE);

        _advanceEpoch();
        _heartbeat(alice);
        assertEq(pol.treasuryBalance(), 2 * TREASURY_FEE);
    }

    function test_treasury_claim() public {
        _register(alice, aliceId);
        _advanceEpoch();
        _heartbeat(alice);

        uint256 expected = 2 * TREASURY_FEE;
        assertEq(pol.treasuryBalance(), expected);

        uint256 balBefore = usdc.balanceOf(address(this));
        pol.claimTreasury();
        assertEq(usdc.balanceOf(address(this)) - balBefore, expected);
        assertEq(pol.treasuryBalance(), 0);
    }

    function test_treasury_claimEmptyReverts() public {
        vm.expectRevert(LastAIStanding.NothingToClaim.selector);
        pol.claimTreasury();
    }

    function test_treasury_claimNotTreasuryReverts() public {
        _register(alice, aliceId);

        vm.expectRevert(LastAIStanding.NotTreasury.selector);
        vm.prank(alice);
        pol.claimTreasury();
    }

    function test_treasury_transfer() public {
        address newTreasury = makeAddr("newTreasury");

        vm.expectEmit(true, true, false, false);
        emit LastAIStanding.TreasuryTransferred(address(this), newTreasury);
        pol.transferTreasury(newTreasury);

        assertEq(pol.treasury(), newTreasury);
    }

    function test_treasury_transferNotTreasuryReverts() public {
        vm.expectRevert(LastAIStanding.NotTreasury.selector);
        vm.prank(alice);
        pol.transferTreasury(alice);
    }

    function test_treasury_transferZeroAddressReverts() public {
        vm.expectRevert(LastAIStanding.ZeroAddress.selector);
        pol.transferTreasury(address(0));
    }

    function test_treasury_newWalletCanClaim() public {
        _register(alice, aliceId);
        address newTreasury = makeAddr("newTreasury");

        pol.transferTreasury(newTreasury);

        // Old treasury can't claim anymore
        vm.expectRevert(LastAIStanding.NotTreasury.selector);
        pol.claimTreasury();

        // New treasury can claim
        uint256 balBefore = usdc.balanceOf(newTreasury);
        vm.prank(newTreasury);
        pol.claimTreasury();
        assertEq(usdc.balanceOf(newTreasury) - balBefore, TREASURY_FEE);
    }

    function test_treasury_accountingIntegrity() public {
        // Full game lifecycle: verify pool + treasury = total USDC deposited
        _register(alice, aliceId);
        _register(bob, bobId);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);

        // Total payments: 4 (alice: register + 2 HB, bob: register)
        uint256 totalPayments = 4 * USDC_1;
        assertEq(usdc.balanceOf(address(pol)), totalPayments);
        assertEq(pol.treasuryBalance(), 4 * TREASURY_FEE);

        // Kill bob, alice claims rewards, then alice dies
        vm.prank(killer);
        pol.kill(bob);
        vm.prank(alice);
        pol.claim();

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);
        vm.prank(alice);
        pol.claim();

        // Contract should only hold treasury fees
        assertEq(usdc.balanceOf(address(pol)), pol.treasuryBalance());

        // Claim treasury → contract should be empty
        pol.claimTreasury();
        assertApproxEqAbs(usdc.balanceOf(address(pol)), 0, 2);
    }

    function test_identity_constructorValidation() public {
        vm.expectRevert(LastAIStanding.InvalidConfig.selector);
        new LastAIStanding(address(usdc), address(0), 1 hours, 1e6);
    }
}
