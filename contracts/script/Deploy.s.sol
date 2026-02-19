// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {LastAIStanding} from "../src/LastAIStanding.sol";

contract DeployScript is Script {
    // USDC on Base
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        vm.startBroadcast();
        LastAIStanding pol = new LastAIStanding(BASE_USDC);
        vm.stopBroadcast();
    }
}
