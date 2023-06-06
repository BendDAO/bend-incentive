import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";
import ProxyAdmin from "@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json";

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

      await utils.verify(implAddress as string, []);
    }
  );

task("upgrade", "upgrade contract")
  .addParam("proxyid", "The proxy contract id")
  .addOptionalParam("implid", "The new impl contract id")
  .addOptionalParam("skipcheck", "Skip upgrade storage check or not")
  .setAction(async ({ skipcheck, proxyid, implid }, { network, ethers, upgrades, run }) => {
    await run("compile");
    let utils = await import("../scripts/utils");
    if (!implid) {
      implid = proxyid;
    }
    const deploymentState = utils.loadPreviousDeployment(network.name);
    const proxyAddress = deploymentState[proxyid].address;
    const upgradeable = await ethers.getContractFactory(implid);
    console.log(`Preparing upgrade proxy ${proxyid}: ${proxyAddress} with new ${implid}`);

    // @ts-ignore
    const upgraded = await upgrades.upgradeProxy(proxyAddress, upgradeable, { unsafeSkipStorageCheck: !!skipcheck });
    await upgraded.deployed();

    const implAddress = await upgrades.erc1967.getImplementationAddress(upgraded.address);
    console.log("New implmentation at: ", implAddress);

    await utils.verify(implAddress as string, []);
  });

task("newProxyAdmin", "Change proxy addmin")
  .addParam("proxyid", "The proxy contract id")
  .setAction(async ({ proxyid }, { ethers, network, upgrades }) => {
    const [deployer] = await ethers.getSigners();
    let utils = await import("../scripts/utils");
    const deploymentState = utils.loadPreviousDeployment(network.name);
    const proxyAddress = deploymentState[proxyid].address;

    const preAdminAddress = await upgrades.erc1967.getAdminAddress(
      proxyAddress
    );
    console.log(`${proxyid} current proxyAdmin: ${preAdminAddress}`);

    const adminFactory = await ethers.getContractFactory(
      ProxyAdmin.abi,
      ProxyAdmin.bytecode,
      deployer
    );

    const adminContract = await (await adminFactory.deploy()).deployed();
    console.log(`${proxyid} new proxyAdmin: ${adminContract.address}`);
  });

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

task("verify:Implmentation", "Verify new implmentation")
  .addParam("impladdr", "The impl contract address")
  .setAction(
    async ({ impladdr }, { run }) => {
      await run("compile");

      let utils = await import("../scripts/utils");

      await utils.verify(impladdr, []);
    }
  );
