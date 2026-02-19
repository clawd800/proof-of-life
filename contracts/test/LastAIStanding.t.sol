// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {LastAIStanding} from "../src/LastAIStanding.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LastAIStandingTest is Test {
    LastAIStanding public pol;
    MockUSDC public usdc;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");
    address dave = makeAddr("dave");
    address killer = makeAddr("killer");

    uint256 constant USDC_1 = 1e6;
    uint256 constant EPOCH = 1 hours;

    function setUp() public {
        // Warp to a clean hour boundary
        vm.warp(1_000_000 * EPOCH);

        usdc = new MockUSDC();
        pol = new LastAIStanding(address(usdc));

        // Fund agents
        for (uint256 i = 0; i < 4; i++) {
            address agent = [alice, bob, charlie, dave][i];
            usdc.mint(agent, 1000 * USDC_1);
            vm.prank(agent);
            usdc.approve(address(pol), type(uint256).max);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _register(address agent) internal {
        vm.prank(agent);
        pol.register();
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
        _register(alice);

        assertEq(pol.totalAlive(), 1);
        assertEq(pol.totalAge(), 1);
        assertEq(pol.totalEverRegistered(), 1);
        assertEq(pol.getAge(alice), 1);
        assertTrue(pol.isAlive(alice));
        assertEq(usdc.balanceOf(address(pol)), USDC_1);
    }

    function test_register_whileAliveReverts() public {
        _register(alice);
        vm.expectRevert(LastAIStanding.AlreadyRegistered.selector);
        _register(alice);
    }

    // ─── Heartbeat ───────────────────────────────────────────────────────

    function test_heartbeat() public {
        _register(alice);
        _advanceEpoch();
        _heartbeat(alice);

        assertEq(pol.getAge(alice), 2);
        assertEq(pol.totalAge(), 2);
        assertEq(usdc.balanceOf(address(pol)), 2 * USDC_1);
    }

    function test_heartbeat_sameEpochReverts() public {
        _register(alice);
        _advanceEpoch();
        _heartbeat(alice);

        vm.expectRevert(LastAIStanding.AlreadyHeartbeat.selector);
        _heartbeat(alice);
    }

    function test_heartbeat_missedEpochReverts() public {
        _register(alice);
        _advanceEpoch();
        _advanceEpoch(); // skipped one

        vm.expectRevert(LastAIStanding.MissedEpoch.selector);
        _heartbeat(alice);
    }

    // ─── Death ───────────────────────────────────────────────────────────

    function test_kill() public {
        _register(alice);
        _advanceEpoch();
        _advanceEpoch(); // alice missed epoch

        vm.prank(killer);
        pol.kill(alice);

        assertFalse(pol.isAlive(alice));
        assertEq(pol.getAge(alice), 0);
        assertEq(pol.totalAlive(), 0);
        assertEq(pol.totalDead(), 1);
    }

    function test_kill_notDeadYetReverts() public {
        _register(alice);
        _advanceEpoch(); // still in grace period

        vm.expectRevert(LastAIStanding.NotDeadYet.selector);
        vm.prank(killer);
        pol.kill(alice);
    }

    function test_kill_alreadyDeadReverts() public {
        _register(alice);
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
        // Alice and Bob register
        _register(alice);
        _register(bob);
        // Both at age 1, totalAge = 2

        // Epoch 1: only Alice heartbeats
        _advanceEpoch();
        _heartbeat(alice);
        // Alice age 2, Bob age 1, totalAge = 3

        // Epoch 2: Bob is dead (missed epoch 1)
        _advanceEpoch();
        _heartbeat(alice);
        // Alice age 3, totalAge = 4 before kill

        // Kill Bob (he missed epoch 1, we're at epoch 2+)
        vm.prank(killer);
        pol.kill(bob);
        // Bob totalPaid = 1 USDC, distributed to Alice (age 3, totalAge 3)
        // accRewardPerAge += 1e6 * 1e18 / 3

        // Alice claims
        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        uint256 reward = usdc.balanceOf(alice) - balBefore;

        // Alice should get all of Bob's 1 USDC (minus rounding)
        assertApproxEqAbs(reward, USDC_1, 1);
    }

    function test_rewardDistribution_multipleAgents() public {
        // A, B, C register
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1-4: A and B heartbeat, C doesn't
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Epoch 2: C is dead
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Kill C
        vm.prank(killer);
        pol.kill(charlie);
        // C totalPaid = 1 USDC
        // A age = 3, B age = 3, totalAge = 6
        // Each gets 1 * (3/6) = 0.5 USDC

        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        // Both should get ~0.5 USDC (500000 wei, ±1 for rounding)
        assertApproxEqAbs(aliceReward, 500000, 1);
        assertApproxEqAbs(bobReward, 500000, 1);
        assertApproxEqAbs(aliceReward + bobReward, USDC_1, 2);
    }

    function test_rewardDistribution_ageWeighted() public {
        // A registers, waits 2 epochs, then B registers
        _register(alice);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _heartbeat(alice);
        _register(bob); // Bob starts at age 1, Alice at age 3

        // C registers and immediately dies
        _register(charlie);
        _advanceEpoch();
        _heartbeat(alice); // age 4
        _heartbeat(bob); // age 2

        // Epoch: charlie is dead
        _advanceEpoch();
        _heartbeat(alice); // age 5
        _heartbeat(bob); // age 3

        vm.prank(killer);
        pol.kill(charlie); // C paid 1 USDC
        // A age = 5, B age = 3, totalAge = 8
        // A gets 1 * (5/8) = 625000
        // B gets 1 * (3/8) = 375000

        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        assertEq(aliceReward, 625000);
        assertEq(bobReward, 375000);
        assertEq(aliceReward + bobReward, USDC_1);
    }

    function test_deadAgentCanClaimEarnedRewards() public {
        // A, B, C register
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        // Epoch 2: C dies, A and B survive
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Kill C (missed epoch 2)
        // Wait, C heartbeat at epoch 1. At epoch 2, C needs to heartbeat.
        // If C doesn't heartbeat at epoch 2, C is dead at epoch 3.
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);
        // C totalPaid = 2 (register + 1 heartbeat), distributed to A & B

        // Now B dies
        _advanceEpoch();
        _heartbeat(alice);
        // B misses

        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);
        // B's totalPaid distributed to Alice

        // Bob (dead) should have claimable rewards from Charlie's death
        uint256 bobClaimable = pol.pendingReward(bob);
        assertTrue(bobClaimable > 0, "Dead bob should have claimable rewards");

        // Bob claims
        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        uint256 bobReceived = usdc.balanceOf(bob) - bobBalBefore;
        assertEq(bobReceived, bobClaimable);
    }

    function test_multipleDeath_sequential() public {
        _register(alice);
        _register(bob);
        _register(charlie);
        _register(dave);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);
        _heartbeat(dave);

        // Epoch 2: only Alice and Bob heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Epoch 3: kill charlie and dave
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie); // C paid 2 USDC
        vm.prank(killer);
        pol.kill(dave); // D paid 2 USDC

        // Total rewards: 4 USDC distributed to Alice (age 4) and Bob (age 4)
        uint256 aliceReward = pol.pendingReward(alice);
        uint256 bobReward = pol.pendingReward(bob);

        // When C is killed first, D (not yet killed) absorbs some of C's rewards.
        // D's absorbed portion becomes D's claimable (settled on D's kill).
        // So A+B get less than 4 USDC, but A+B+D_claimable == 4 USDC.
        assertTrue(aliceReward > 0);
        assertTrue(bobReward > 0);
        uint256 daveClaimable = pol.pendingReward(dave);
        uint256 charlieClaimable = pol.pendingReward(charlie);
        assertApproxEqAbs(
            aliceReward + bobReward + daveClaimable + charlieClaimable,
            4 * USDC_1,
            4 // rounding tolerance
        );
    }

    // ─── Edge Cases ──────────────────────────────────────────────────────

    function test_singleAgent_neverDies() public {
        _register(alice);

        for (uint256 i = 0; i < 10; i++) {
            _advanceEpoch();
            _heartbeat(alice);
        }

        assertEq(pol.getAge(alice), 11);
        assertEq(pol.totalAlive(), 1);
        assertEq(pol.pendingReward(alice), 0); // no deaths = no rewards
    }

    // ─── Last AI Standing (Winner) ───────────────────────────────────

    function test_lastAgentStanding_winsOwnFundsBack() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        // Epoch 2: only Alice heartbeats
        _advanceEpoch();
        _heartbeat(alice);

        // Epoch 3: Alice still going, kill Bob and Charlie
        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob); // Bob's 2 USDC → pool
        vm.prank(killer);
        pol.kill(charlie); // Charlie's 2 USDC → pool

        // Alice claims rewards from Bob and Charlie dying
        vm.prank(alice);
        pol.claim();

        // Now Alice misses and dies — she's the last agent
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        // Alice gets her own totalPaid back (4 USDC: register + 3 heartbeats)
        assertEq(pol.totalAlive(), 0);
        uint256 alicePending = pol.pendingReward(alice);
        assertEq(alicePending, 4 * USDC_1, "Winner gets own totalPaid back");

        // Alice claims
        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, 4 * USDC_1);
    }

    function test_lastAgentStanding_twoAgentSimple() public {
        _register(alice);
        _register(bob);

        // Epoch 1: only Alice heartbeats
        _advanceEpoch();
        _heartbeat(alice);

        // Epoch 2: kill Bob
        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob); // Bob's 1 USDC → Alice

        // Alice claims Bob's reward
        vm.prank(alice);
        pol.claim();

        // Alice stops heartbeating → dies as last agent
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        // Alice gets her own totalPaid (3 USDC) back
        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, 3 * USDC_1);
    }

    function test_lastAgentStanding_simultaneousDeath() public {
        _register(alice);
        _register(bob);

        _advanceEpoch();
        _advanceEpoch();

        // Both missed — kill Alice first, then Bob (last agent)
        vm.prank(killer);
        pol.kill(alice); // Alice's 1 USDC → Bob (totalAge = 1)

        vm.prank(killer);
        pol.kill(bob); // Bob is last → gets own totalPaid back

        assertEq(pol.totalAlive(), 0);

        // Bob gets: Alice's reward (1 USDC via accRewardPerAge) + own totalPaid (1 USDC)
        uint256 bobPending = pol.pendingReward(bob);
        assertEq(bobPending, 2 * USDC_1);

        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        assertEq(usdc.balanceOf(bob) - bobBalBefore, 2 * USDC_1);

        // Contract should be empty (all 2 USDC claimed by Bob)
        assertEq(usdc.balanceOf(address(pol)), 0);
    }

    function test_lastAgentStanding_doesNotStealUnclaimedRewards() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        // Epoch 2: Charlie misses
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Epoch 3: kill Charlie. His 2 USDC goes to Alice (age 3) and Bob (age 3)
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie); // 2 USDC → Alice and Bob (1 each)

        // Bob does NOT claim his 1 USDC reward

        // Epoch 4: Bob misses
        _advanceEpoch();
        _heartbeat(alice);

        // Epoch 5: kill Bob, then Alice dies too
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(bob); // Bob's 3 USDC → Alice (only survivor)

        // Alice misses
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice); // Alice is last agent

        // Bob should still be able to claim his unclaimed rewards
        uint256 bobPending = pol.pendingReward(bob);
        assertTrue(bobPending > 0, "Bob should have unclaimed rewards");

        // Alice gets her own totalPaid back + earned rewards (NOT Bob's unclaimed)
        uint256 alicePending = pol.pendingReward(alice);

        // Both can claim independently
        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        pol.claim();
        uint256 bobReceived = usdc.balanceOf(bob) - bobBalBefore;
        assertEq(bobReceived, bobPending);

        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        uint256 aliceReceived = usdc.balanceOf(alice) - aliceBalBefore;
        assertEq(aliceReceived, alicePending);
    }

    function test_registryTracking() public {
        _register(alice);
        _register(bob);
        _register(charlie);

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
        _register(alice);

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
        _register(alice);
        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        _advanceEpoch();
        vm.expectRevert(LastAIStanding.AlreadyDead.selector);
        _heartbeat(alice);
    }

    function test_heartbeat_sameEpochAsRegisterReverts() public {
        _register(alice);

        vm.expectRevert(LastAIStanding.AlreadyHeartbeat.selector);
        _heartbeat(alice);
    }

    // ─── Kill edge cases ─────────────────────────────────────────────────

    function test_kill_unregisteredReverts() public {
        vm.expectRevert(LastAIStanding.AlreadyDead.selector);
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
        _register(alice);
        assertFalse(pol.isKillable(alice)); // just registered

        _advanceEpoch();
        assertFalse(pol.isKillable(alice)); // in grace period

        _advanceEpoch();
        assertTrue(pol.isKillable(alice)); // missed epoch

        vm.prank(killer);
        pol.kill(alice);
        assertFalse(pol.isKillable(alice)); // already dead
    }

    // ─── totalPool ───────────────────────────────────────────────────────

    function test_totalPool() public {
        assertEq(pol.totalPool(), 0);

        _register(alice);
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
        _register(alice);
        _register(bob);
        _register(charlie);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 2);
        assertEq(list.length, 3);
        assertEq(list[0].addr, alice);
        assertEq(list[1].addr, bob);
        assertEq(list[2].addr, charlie);
        assertTrue(list[0].alive);
        assertEq(list[0].age, 1);
        assertFalse(list[0].killable);
    }

    function test_getAgentList_clampsEndIndex() public {
        _register(alice);
        _register(bob);

        // endIndex beyond registry length should be clamped
        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 100);
        assertEq(list.length, 2);
        assertEq(list[0].addr, alice);
        assertEq(list[1].addr, bob);
    }

    function test_getAgentList_partial() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(1, 2);
        assertEq(list.length, 2);
        assertEq(list[0].addr, bob);
        assertEq(list[1].addr, charlie);
    }

    function test_getAgentList_invalidRangeReverts() public {
        _register(alice);

        vm.expectRevert(LastAIStanding.InvalidRange.selector);
        pol.getAgentList(2, 0);
    }

    function test_getAgentList_withKillable() public {
        _register(alice);
        _register(bob);

        _advanceEpoch();
        _heartbeat(alice);
        // Bob misses

        _advanceEpoch();
        // Bob is now killable

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 1);
        assertFalse(list[0].killable); // alice is alive
        assertTrue(list[1].killable); // bob missed
    }

    function test_getAgentList_deadAgent() public {
        _register(alice);

        _advanceEpoch();
        _advanceEpoch();

        vm.prank(killer);
        pol.kill(alice);

        LastAIStanding.AgentInfo[] memory list = pol.getAgentList(0, 0);
        assertEq(list.length, 1);
        assertFalse(list[0].alive);
        assertFalse(list[0].killable);
        assertEq(list[0].age, 0);
    }

    // ─── getKillable ─────────────────────────────────────────────────────

    function test_getKillable_none() public {
        _register(alice);
        _register(bob);

        address[] memory k = pol.getKillable(0, 1);
        assertEq(k.length, 0);
    }

    function test_getKillable_some() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        _advanceEpoch();
        _heartbeat(alice); // alice survives

        _advanceEpoch();
        _heartbeat(alice); // bob and charlie missed

        address[] memory k = pol.getKillable(0, 2);
        assertEq(k.length, 2);
        assertEq(k[0], bob);
        assertEq(k[1], charlie);
    }

    function test_getKillable_partial() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        _advanceEpoch();
        _advanceEpoch(); // all missed

        // Only scan index 1-2 (bob, charlie)
        address[] memory k = pol.getKillable(1, 2);
        assertEq(k.length, 2);
        assertEq(k[0], bob);
        assertEq(k[1], charlie);
    }

    function test_getKillable_clampsEndIndex() public {
        _register(alice);

        _advanceEpoch();
        _advanceEpoch();

        address[] memory k = pol.getKillable(0, 100);
        assertEq(k.length, 1);
        assertEq(k[0], alice);
    }

    function test_getKillable_empty() public view {
        address[] memory k = pol.getKillable(0, 0);
        assertEq(k.length, 0);
    }

    function test_getKillable_invalidRangeReverts() public {
        _register(alice);

        vm.expectRevert(LastAIStanding.InvalidRange.selector);
        pol.getKillable(2, 0);
    }

    function test_getKillable_afterKill() public {
        _register(alice);
        _register(bob);

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
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        // Epoch 2: charlie dies
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        vm.prank(killer);
        pol.kill(charlie);

        // Alice claims first batch
        uint256 reward1 = pol.pendingReward(alice);
        assertTrue(reward1 > 0);
        vm.prank(alice);
        pol.claim();
        assertEq(pol.pendingReward(alice), 0);

        // Bob dies, Alice gets more rewards
        _advanceEpoch();
        _heartbeat(alice);
        _advanceEpoch();
        _heartbeat(alice);

        vm.prank(killer);
        pol.kill(bob);

        // Alice claims second batch
        uint256 reward2 = pol.pendingReward(alice);
        assertTrue(reward2 > 0);
        vm.prank(alice);
        pol.claim();
        assertEq(pol.pendingReward(alice), 0);
    }

    // ─── isAlive timing edge ─────────────────────────────────────────────

    function test_isAlive_graceWindow() public {
        _register(alice);
        // Just registered at epoch N, isAlive = true
        assertTrue(pol.isAlive(alice));

        _advanceEpoch();
        // Epoch N+1: still alive (grace window)
        assertTrue(pol.isAlive(alice));

        _advanceEpoch();
        // Epoch N+2: dead (missed N+1)
        assertFalse(pol.isAlive(alice));
        assertTrue(pol.isKillable(alice));
    }

    // ─── Re-registration ─────────────────────────────────────────────────

    function test_reregister_basic() public {
        _register(alice);

        // Alice dies
        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        assertFalse(pol.isAlive(alice));

        // Alice re-registers
        _register(alice);

        assertTrue(pol.isAlive(alice));
        assertEq(pol.getAge(alice), 1);
        assertEq(pol.totalAlive(), 1);
        assertEq(pol.totalEverRegistered(), 2); // counted twice
        assertEq(pol.registryLength(), 1); // unique agent count unchanged
    }

    function test_reregister_preservesClaimable() public {
        _register(alice);
        _register(bob);

        // Epoch 1: both heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Epoch 2: Alice misses
        _advanceEpoch();
        _heartbeat(bob);

        // Epoch 3: kill Alice
        _advanceEpoch();
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(alice);

        // Alice has claimable rewards from... nothing (nobody died before her)
        // But wait, Alice's totalPaid goes to Bob. Alice claimable = 0 here.
        // Let's make it more interesting: add Charlie who dies first.

        // Start over with a better scenario
    }

    function test_reregister_preservesClaimable_v2() public {
        _register(alice);
        _register(bob);
        _register(charlie);

        // Epoch 1: all heartbeat
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        _heartbeat(charlie);

        // Epoch 2: Charlie misses
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);

        // Epoch 3: kill Charlie → rewards to Alice and Bob
        _advanceEpoch();
        _heartbeat(alice);
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(charlie);

        // Both Alice and Bob have pending rewards from Charlie's death
        uint256 aliceRewardBeforeDeath = pol.pendingReward(alice);
        assertTrue(aliceRewardBeforeDeath > 0);

        // Epoch 4: Alice misses
        _advanceEpoch();
        _heartbeat(bob);

        // Epoch 5: kill Alice (she has unclaimed rewards from Charlie)
        _advanceEpoch();
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(alice);

        uint256 aliceClaimableAfterDeath = pol.pendingReward(alice);
        assertTrue(aliceClaimableAfterDeath > 0);

        // Alice re-registers WITHOUT claiming first
        _register(alice);

        // Her old claimable should be preserved
        uint256 alicePendingAfterReregister = pol.pendingReward(alice);
        assertEq(alicePendingAfterReregister, aliceClaimableAfterDeath,
            "Claimable from previous life should carry over");

        // Alice can claim the old rewards
        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pol.claim();
        uint256 received = usdc.balanceOf(alice) - balBefore;
        assertEq(received, aliceClaimableAfterDeath);
    }

    function test_reregister_noRegistryDuplicate() public {
        _register(alice);

        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        _register(alice);

        // Registry should still only have 1 entry
        assertEq(pol.registryLength(), 1);
        assertEq(pol.registryAt(0), alice);
    }

    function test_reregister_fullLifecycle() public {
        // Alice plays 3 lives
        for (uint256 life = 0; life < 3; life++) {
            _register(alice);
            assertTrue(pol.isAlive(alice));

            // Survive a few epochs
            _advanceEpoch();
            _heartbeat(alice);
            _advanceEpoch();
            _heartbeat(alice);

            // Die
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
        // Wave 1: Alice and Bob play
        _register(alice);
        _register(bob);

        _advanceEpoch();
        _heartbeat(alice);

        // Bob dies, Alice gets rewards
        _advanceEpoch();
        _heartbeat(alice);
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(bob);

        // Alice dies (last agent)
        _advanceEpoch();
        _advanceEpoch();
        vm.prank(killer);
        pol.kill(alice);

        assertEq(pol.totalAlive(), 0);

        // Alice claims everything (got Bob's rewards + own totalPaid back)
        vm.prank(alice);
        pol.claim();

        // Bob has nothing to claim (no one died before him, his rewards = 0)

        // Wave 2: Bob and Charlie join (new wave starts naturally)
        _register(bob);
        _register(charlie);

        assertEq(pol.totalAlive(), 2);
        assertTrue(pol.isAlive(bob));
        assertTrue(pol.isAlive(charlie));

        // Game continues normally
        _advanceEpoch();
        _heartbeat(bob);

        _advanceEpoch();
        _heartbeat(bob);
        vm.prank(killer);
        pol.kill(charlie);

        // Bob earned Charlie's 1 USDC
        uint256 bobReward = pol.pendingReward(bob);
        assertApproxEqAbs(bobReward, USDC_1, 1);
    }

    function test_reregister_contractDrainsToZero() public {
        // Verify all USDC is recoverable across multiple waves
        _register(alice);
        _register(bob);

        _advanceEpoch();
        _heartbeat(alice);

        _advanceEpoch();
        _advanceEpoch();

        // Kill both (Bob first, then Alice as last agent)
        vm.prank(killer);
        pol.kill(bob); // Bob's 1 USDC → Alice via accRewardPerAge
        vm.prank(killer);
        pol.kill(alice); // Alice gets own 2 USDC back (last agent)

        // Alice has: reward from Bob (1 USDC) + own totalPaid returned (2 USDC) = 3 USDC
        // Bob has: 0 (no one died before him, he earned nothing)
        vm.prank(alice);
        pol.claim();

        // Bob's claimable = his pending from before death. He died first,
        // nobody died before him, so his reward = 0.
        // Don't try to claim for Bob — he has nothing.

        // Contract should be empty (within rounding dust)
        // Total in: 3 USDC (Alice 2 + Bob 1). Total out: 3 USDC (Alice claimed all).
        assertApproxEqAbs(usdc.balanceOf(address(pol)), 0, 2);
    }
}
