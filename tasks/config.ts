import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";

task("StakedBUNI:configure", "Configure StakedBUNI").setAction(
  async ({}, { network, ethers, upgrades }) => {
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    let config = constants.getStakedBuniIncentiveConfig(network.name);
    const stakedBUNI = await utils.load(
      "StakedBUNI",
      deployer,
      deploymentState
    );
    utils.waitForTx(await stakedBUNI.configure(config));
  }
);

task("StakedBUNI:approveVault", "Configure StakedBUNI").setAction(
  async ({}, { network, ethers, upgrades }) => {
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    const vault = await utils.load("Vault", deployer, deploymentState);
    utils.waitForTx(
      await vault.approve(
        deploymentState["StakedBUNI"].address,
        utils.makeBN18(30000000)
      )
    );
  }
);
