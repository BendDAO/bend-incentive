// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, network } from "hardhat";
import {
  loadPreviousDeployment,
  load,
  loadOrDeploy,
  makeBN18,
  waitForTx,
} from "./utils";
import { Contract, constants } from "ethers";
import { getFeeDistributorParams, getSnapshotDelatation } from "./constants";

import dotenv from "dotenv";
const envResult = dotenv.config();

if (envResult.error || !envResult.parsed) {
  throw envResult.error;
}
const env = envResult.parsed;

export interface Contracts {
  bendToken: Contract;
  vebend: Contract;
  feeDistributor: Contract;
  lockup: Contract;
}

async function deployCore() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const deploymentState = loadPreviousDeployment(network.name);

  const bendToken = await load("BendToken", deployer, deploymentState);
  const vebend = await loadOrDeploy(
    "VeBend",
    [bendToken.address],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  let [WETH, bWETH, addressesProvider, bendCollector] = getFeeDistributorParams(
    network.name
  );

  const feeDistributor = await loadOrDeploy(
    "FeeDistributor",
    [WETH, bWETH, vebend.address, addressesProvider, bendCollector],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  let snapshotDelegation = getSnapshotDelatation(network.name);
  const lockup = await loadOrDeploy(
    "LockupBendFactory",
    [
      WETH,
      bendToken.address,
      vebend.address,
      feeDistributor.address,
      snapshotDelegation,
    ],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  return {
    bendToken,
    vebend,
    feeDistributor,
    lockup,
  } as Contracts;
}

async function main() {
  const contracts = await deployCore();
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
