// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, network } from "hardhat";
import {
  loadPreviousDeployment,
  loadOrDeploy,
  waitForTx,
  makeBN18,
} from "./utils";
import {
  ZERO_ADDRESS,
  MAX_UINT_AMOUNT,
  ONE_YEAR,
  getBTokenConfig,
  getFeeDistributorParams,
  BEND_TOKEN_MAX_SUPPLY,
} from "./constants";
import { Contract } from "ethers";
import { makeBN } from "../test/utils";

import dotenv from "dotenv";
const envResult = dotenv.config();

if (envResult.error || !envResult.parsed) {
  throw envResult.error;
}
const env = envResult.parsed;

console.log("ENV:", env);

export interface Contracts {
  airdrop: Contract;
  bendToken: Contract;
  vault: Contract;
  incentivesController: Contract;
  vebend: Contract;
  feeDistributor: Contract;
  keeper: Contract;
}

async function deployCore() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const deploymentState = loadPreviousDeployment(network.name);

  const envInitKey = `${network.name}_BEND_TOKEN_INIT_ADDRESS`.toUpperCase();
  const initAddress = env[envInitKey] ? env[envInitKey] : deployer.address;
  console.log("Token Init Address:", env[envInitKey], initAddress);

  const bendToken = await loadOrDeploy(
    "BendToken",
    [initAddress, makeBN18(BEND_TOKEN_MAX_SUPPLY)],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  const airdrop = await loadOrDeploy(
    "MerkleDistributor",
    [bendToken.address],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  return {
    airdrop,
    bendToken
  } as Contracts;
}

async function main() {
  let contracts = await deployCore();
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
