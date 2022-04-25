import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";

task("PrepareUpgrade", "Deploy new implmentation for upgrade")
  .addParam("id", "The contract id")
  .setAction(async ({ id }, { network, ethers, upgrades, run }) => {
    await run("compile");
    let utils = await import("../scripts/utils");
    const deploymentState = utils.loadPreviousDeployment(network.name);
    const proxyAddress = deploymentState[id].address;
    const upgradeable = await ethers.getContractFactory(id);
    console.log(`Preparing ${id} upgrade...`);
    const implAddress = await upgrades.prepareUpgrade(
      proxyAddress,
      upgradeable
    );
    console.log("Implmentation at:", implAddress);

    let adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
    console.log("Proxy admin at:", adminAddress);

    await utils.verifyContract(
      id,
      network.name,
      implAddress,
      [],
      deploymentState
    );
  });
