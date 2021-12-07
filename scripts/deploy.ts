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
import { ZERO_ADDRESS, MAX_UINT_AMOUNT, ONE_YEAR } from "./constants";
import { Contract } from "ethers";
import dotenv from "dotenv";
const envResult = dotenv.config();

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
    [vault.address, makeBN18(10000000)],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );
  const governance = await loadOrDeploy(
    "Governance",
    [15, GUARDIAN_MULTI_SIG_ADDR],
    network.name,
    deployer,
    deploymentState
  );
  const shortTimelockExecutor = await loadOrDeploy(
    "Executor",
    [governance.address, 86400, 432000, 86400, 864000, 50, 19200, 50, 200],
    network.name,
    deployer,
    deploymentState,
    { id: "ShortTimelockExecutor" }
  );
  const longTimelockExecutor = await loadOrDeploy(
    "Executor",
    [
      governance.address,
      604800,
      432000,
      604800,
      864000,
      200,
      64000,
      1500,
      2000,
    ],
    network.name,
    deployer,
    deploymentState,
    { id: "LongTimelockExecutor" }
  );

  const stakedBend = await loadOrDeploy(
    "StakedBend",
    [
      bendToken.address,
      bendToken.address,
      864000,
      172800,
      vault.address,
      deployer.address,
      // shortTimelockExecutor.address,
      3153600000,
      "Staked BEND",
      "stkBEND",
      18,
    ],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  const governanceStrategy = await loadOrDeploy(
    "GovernanceStrategy",
    [bendToken.address, stakedBend.address],
    network.name,
    deployer,
    deploymentState
  );

  const incentivesController = await loadOrDeploy(
    "StakedBendIncentivesController",
    [
      stakedBend.address,
      vault.address,
      deployer.address,
      // shortTimelockExecutor.address,
      ONE_YEAR * 100,
    ],
    network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );
  return {
    bendToken,
    governance,
    governanceStrategy,
    shortTimelockExecutor,
    longTimelockExecutor,
    vault,
    stakedBend,
    incentivesController,
  } as Contracts;
}
async function connect(contracts: Contracts) {
  const {
    bendToken,
    governance,
    governanceStrategy,
    shortTimelockExecutor,
    longTimelockExecutor,
    vault,
    stakedBend,
    incentivesController,
  } = contracts;
  waitForTx(
    await governance.authorizeExecutors([
      shortTimelockExecutor.address,
      longTimelockExecutor.address,
    ])
  );
  waitForTx(await governance.setGovernanceStrategy(governanceStrategy.address));
  waitForTx(await governance.transferOwnership(longTimelockExecutor.address));
  waitForTx(
    await vault.approve(
      bendToken.address,
      incentivesController.address,
      MAX_UINT_AMOUNT
    )
  );
  await waitForTx(
    await vault.approve(bendToken.address, stakedBend.address, MAX_UINT_AMOUNT)
  );

  // waitForTx(await vault.transferOwnership(shortTimelockExecutor.address));
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
