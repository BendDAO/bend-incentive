#!/bin/bash
set -x #echo on

mkdir ./flattened
rm -rf ./flattened/*

npx hardhat flatten contracts/token/Vault.sol > ./flattened/Vault.sol
npx hardhat flatten contracts/token/BendToken.sol > ./flattened/BendToken.sol
npx hardhat flatten contracts/incentives/BendProtocolIncentivesController.sol > ./flattened/BendProtocolIncentivesController.sol

tar czf bend-incentive-flattened.tgz ./flattened
