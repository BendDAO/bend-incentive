// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const utils = require("./utils.js");
const envResult = require("dotenv").config();
const constants = require("./constants.js");

if (envResult.error) {
  throw envResult.error;
}
const env = envResult.parsed;

const GUARDIAN_MULTI_SIG_ADDR =
  env[`${hre.network.name.toUpperCase()}_GOVERNANCE_GUARDIAN`] ||
  constants.ZERO_ADDRESS;

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const deploymentState = utils.loadPreviousDeployment(hre.network.name);
  const aaveToken = await utils.loadOrDeploy(
    "AaveToken",
    [],
    hre.network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );
  const governance = await utils.loadOrDeploy(
    "Governance",
    [0, GUARDIAN_MULTI_SIG_ADDR],
    hre.network.name,
    deployer,
    deploymentState
  );
  const shortTimelockExecutor = await utils.loadOrDeploy(
    "Executor",
    [governance.address, 86400, 432000, 86400, 864000, 50, 19200, 50, 200],
    hre.network.name,
    deployer,
    deploymentState,
    { id: "ShortTimelockExecutor" }
  );
  const longTimelockExecutor = await utils.loadOrDeploy(
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
    hre.network.name,
    deployer,
    deploymentState,
    { id: "LongTimelockExecutor" }
  );
  utils.waitForTx(
    await governance.authorizeExecutors([
      shortTimelockExecutor.address,
      longTimelockExecutor.address,
    ])
  );
  const ecosystemReserve = await utils.loadOrDeploy(
    "EcosystemReserve",
    [],
    hre.network.name,
    deployer,
    deploymentState,
    { proxy: true, proxyInitializer: false }
  );
  const controllerEcosystemReserve = await utils.loadOrDeploy(
    "ControllerEcosystemReserve",
    [shortTimelockExecutor.address, ecosystemReserve.address],
    hre.network.name,
    deployer,
    deploymentState
  );
  try {
    utils.waitForTx(
      await ecosystemReserve.initialize(controllerEcosystemReserve.address)
    );
  } catch (error) {}

  const stakedToken = await utils.loadOrDeploy(
    "StakedToken",
    [
      aaveToken.address,
      aaveToken.address,
      864000,
      172800,
      ecosystemReserve.address,
      shortTimelockExecutor.address,
      3153600000,
      "Staked AAVE",
      "stkAAVE",
      18,
      constants.ZERO_ADDRESS,
    ],
    hre.network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );

  await utils.loadOrDeploy(
    "StakedTokenIncentivesController",
    [stakedToken.address, shortTimelockExecutor.address],
    hre.network.name,
    deployer,
    deploymentState,
    { proxy: true }
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
