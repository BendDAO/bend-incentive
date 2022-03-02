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
  getStakedBendConfig,
  getBTokenConfig,
} from "./constants";
import { Contract } from "ethers";
import dotenv from "dotenv";
import { makeBN } from "../test/utils";
const envResult = dotenv.config();

const COOLDOWN_SECONDS = "864000"; // 10 days
const UNSTAKE_WINDOW = "172800"; // 2 days

export interface Contracts {
  bendToken: Contract;
  governance: Contract;
  governanceStrategy: Contract;
  shortTimelockExecutor: Contract;
  longTimelockExecutor: Contract;
  vault: Contract;
  stakedBend: Contract;
  incentivesController: Contract;
}

if (envResult.error || !envResult.parsed) {
  throw envResult.error;
}
const env = envResult.parsed;

console.log("ENV:", env);

const GUARDIAN_MULTI_SIG_ADDR =
  env[`${network.name.toUpperCase()}_GOVERNANCE_GUARDIAN`] || ZERO_ADDRESS;

async function deploy() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const deploymentState = loadPreviousDeployment(network.name);
  const vault = await loadOrDeploy(
    "Vault",
    [],
    network.name,
    deployer,
    deploymentState
  );
  const bendToken = await loadOrDeploy(
    "BendToken",
    [vault.address, makeBN18(100000000)],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  const incentivesController = await loadOrDeploy(
    "BendProtocolIncentivesController",
    [bendToken.address, vault.address, ONE_YEAR * 100],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );
  return {
    bendToken,
    vault,
    incentivesController,
  } as Contracts;
}
async function connect(contracts: Contracts) {
  const { bendToken, vault, incentivesController } = contracts;

  try {
    waitForTx(
      await vault.approve(
        bendToken.address,
        incentivesController.address,
        makeBN(MAX_UINT_AMOUNT)
      )
    );
  } catch (error) {}

  let bTokensConfig = getBTokenConfig(network.name);
  if (bTokensConfig.length > 0) {
    waitForTx(
      await incentivesController.configureAssets(
        bTokensConfig[0],
        bTokensConfig[1]
      )
    );
  } else {
    console.log("bTokensConfig is empty.");
  }
}

async function main() {
  let contracts = await deploy();
  await connect(contracts);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
