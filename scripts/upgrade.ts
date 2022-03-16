import { ethers, upgrades, network } from "hardhat";
import { loadPreviousDeployment, verifyContract } from "./utils";

async function main() {
  const id = "FeeDistributor";
  const deploymentState = loadPreviousDeployment(network.name);
  const upgradeable = await ethers.getContractFactory(id);
  console.log(`Preparing ${id} upgrade...`);
  const upgraded = await upgrades.upgradeProxy(
    deploymentState.FeeDistributor.address,
    upgradeable
  );

  let implAddress = await upgrades.erc1967.getImplementationAddress(
    upgraded.address
  );
  console.log("upgraded at:", implAddress);
  await verifyContract(id, network.name, upgraded.address, [], deploymentState);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
