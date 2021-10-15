import hre from "hardhat";
import fs from "fs";
import { Signer } from "ethers";
const outputDir = "./deployments";

export async function loadOrDeploy(
  name: string,
  params: any[],
  network: string,
  deployer: Signer,
  deploymentState: {},
  options?: {
    id?: string;
    proxy?: boolean;
    proxyInitializer?: string | false;
    verify?: boolean;
  }
) {
  options = {
    id: name,
    proxy: false,
    proxyInitializer: undefined,
    verify: true,
    ...options,
  };

  const id = options.id;
  const outputFile = `${outputDir}/${network}.json`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const ETHERSCAN_BASE_URL =
    process.env[`${network.toUpperCase()}_ETHERSCAN_BASE_URL`];

  const factory = await hre.ethers.getContractFactory(name);
  const verify = async function (contract) {
    if (options.verify) {
      if (options.proxy) {
        const address = await getProxyImpl(contract.address);
        await verifyContract(address);
        deploymentState[
          id
        ].verification = `${ETHERSCAN_BASE_URL}/${address}#code`;
        await verifyContract(contract.address);
        deploymentState[
          id
        ].proxyVerification = `${ETHERSCAN_BASE_URL}/${contract.address}#code`;
      } else {
        await verifyContract(contract.address, params);
        deploymentState[
          id
        ].verification = `${ETHERSCAN_BASE_URL}/${contract.address}#code`;
      }
    }
  };
  if (deploymentState[id] && deploymentState[id].address) {
    console.log(
      `Using previously deployed ${id} contract at address ${deploymentState[id].address}`
    );
    const contract = new hre.ethers.Contract(
      deploymentState[id].address,
      factory.interface,
      deployer
    );

    await verify(contract);
    saveDeployment(deploymentState, outputFile);
    return contract;
  }
  let contract;
  if (options.proxy) {
    if (options.proxyInitializer !== undefined) {
      contract = await hre.upgrades.deployProxy(factory, params, {
        initializer: options.proxyInitializer,
      });
    } else {
      contract = await hre.upgrades.deployProxy(factory, params);
    }
  } else {
    contract = await factory.deploy(...params);
  }
  await contract.deployed();
  if (options.proxy) {
    const implAddress = await getProxyImpl(contract.address);
    console.log(
      `${id} deployed at\n  proxy: ${contract.address}\n  impl: ${implAddress}`
    );
  } else {
    console.log(`${id} deployed at address ${contract.address}`);
  }
  deploymentState[id] = {
    address: contract.address,
    txHash: contract.deployTransaction.hash,
  };

  await verify(contract);

  saveDeployment(deploymentState, outputFile);

  return contract;
}

function saveDeployment(deploymentState, outputFile) {
  const deploymentStateJSON = JSON.stringify(deploymentState, null, 2);
  fs.writeFileSync(outputFile, deploymentStateJSON);
}

export function loadPreviousDeployment(network: string) {
  let previousDeployment = {};
  const outputFile = `${outputDir}/${network}.json`;
  if (fs.existsSync(outputFile)) {
    console.log(`Loading previous deployment...`);
    previousDeployment = require("../" + outputFile);
  }

  return previousDeployment;
}

export async function verifyContract(
  address: string,
  constructorArguments: any = []
) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
    });
  } catch (error) {
    // if it was already verified, it’s like a success, so let’s move forward and save it
    if (error.name !== "NomicLabsHardhatPluginError") {
      console.error(`Error verifying: ${error.name}`);
      console.error(error);
    }
  }
}

async function getProxyImpl(address: string) {
  const implHex = await hre.ethers.provider.getStorageAt(
    address,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  return hre.ethers.utils.hexStripZeros(implHex);
}

export async function waitForTx(tx) {
  await tx.wait();
}