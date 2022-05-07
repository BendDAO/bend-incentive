import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";
import { waitForTx } from "../test/utils";

task("prepareUpgrade", "Deploy new implmentation for upgrade")
  .addParam("proxyid", "The proxy contract id")
  .addParam("implid", "The new impl contract id")
  .setAction(
    async ({ proxyid, implid }, { network, ethers, upgrades, run }) => {
      await run("compile");
      let utils = await import("../scripts/utils");
      const deploymentState = utils.loadPreviousDeployment(network.name);
      const proxyAddress = deploymentState[proxyid].address;
      const upgradeable = await ethers.getContractFactory(implid);
      console.log(`Preparing ${proxyid} upgrade at proxy ${proxyAddress}`);
      const implAddress = await upgrades.prepareUpgrade(
        proxyAddress,
        upgradeable
      );
      console.log("Implmentation at:", implAddress);
      let adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
      console.log("Proxy admin at:", adminAddress);

      await utils.verify(implAddress);
    }
  );

task("forceImport", "Deploy new implmentation for upgrade")
  .addParam("proxyid", "The proxy contract id")
  .addParam("implid", "The new impl contract id")
  .setAction(
    async ({ proxyid, implid }, { network, ethers, upgrades, run }) => {
      await run("compile");
      let utils = await import("../scripts/utils");
      const deploymentState = utils.loadPreviousDeployment(network.name);
      const proxyAddress = deploymentState[proxyid].address;
      const implFactory = await ethers.getContractFactory(implid);
      const implAddress = await upgrades.erc1967.getImplementationAddress(
        proxyAddress
      );
      console.log(
        `Import ${proxyid} proxy: ${proxyAddress} impl: ${implAddress}`
      );
      await upgrades.forceImport(proxyAddress, implFactory);
    }
  );
