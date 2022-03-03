// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, network } from "hardhat";
import { loadPreviousDeployment, waitForTx, load } from "./utils";
import { getBTokenConfig } from "./constants";
import { Contract } from "ethers";
import dotenv from "dotenv";
const envResult = dotenv.config();

if (envResult.error || !envResult.parsed) {
  throw envResult.error;
}
const env = envResult.parsed;

console.log("ENV:", env);

async function configureAssets(incentivesController: Contract) {
  console.log("Contract:", incentivesController);
  let bTokensConfig = getBTokenConfig(network.name);
  if (bTokensConfig.length > 0) {
    console.log("bTokensConfig:", bTokensConfig);
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
  const [deployer] = await ethers.getSigners();
  const deploymentState = loadPreviousDeployment(network.name);
  const incentivesController = await load(
    "BendProtocolIncentivesController",
    network.name,
    deployer,
    deploymentState["BendProtocolIncentivesController"]
  );
  await configureAssets(incentivesController);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
