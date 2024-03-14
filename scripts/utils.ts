import hre from "hardhat";
import fs from "fs";
import { Signer } from "ethers";
const outputDir = "./deployments";
import { Contract, ContractTransaction, BigNumber, ethers } from "ethers";
import { NomicLabsHardhatPluginError } from "hardhat/plugins";
import { ZERO_ADDRESS } from "./constants";

export interface DeploymentStateItem {
  address: string;
  txHash: string;
  verification?: string;
  proxyVerification?: string;
}

export function makeBN(num: string | number | any, precision: number = 0) {
  return ethers.utils.parseUnits(num.toString(), precision);
}

export function makeBN18(num: string | number) {
  return ethers.utils.parseUnits(num.toString(), 18);
}

export async function load(
  name: string,
  deployer: Signer,
  deploymentState: Record<string, DeploymentStateItem>
) {
  const factory = await hre.ethers.getContractFactory(name);
  const contract = new hre.ethers.Contract(
    deploymentState[name].address,
    factory.interface,
    deployer
  );

  return contract;
}

export async function loadOrDeploy(
  name: string,
  params: any[],
  network: string,
  deployer: Signer,
  deploymentState: Record<string, DeploymentStateItem>,
  options: {
    id?: string;
    proxy?: boolean;
    proxyInitializer?: string | false;
    verify?: boolean;
  } = {}
) {
  options = {
    id: name,
    proxy: false,
    proxyInitializer: undefined,
    verify: true,
    ...options,
  };

  const id = options.id || name;
  const outputFile = `${outputDir}/${network}.json`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const factory = await hre.ethers.getContractFactory(name);

  if (deploymentState[id] && deploymentState[id].address) {
    console.log(
      `Using previously deployed ${id} contract at address ${deploymentState[id].address}`
    );
    const contract = new hre.ethers.Contract(
      deploymentState[id].address,
      factory.interface,
      deployer
    );

    await verifyContract(
      id,
      network,
      contract.address,
      params,
      deploymentState
    );
    return contract;
  }
  console.log("params:", params);
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
  saveDeployment(deploymentState, outputFile);
  await verifyContract(id, network, contract.address, params, deploymentState);

  return contract;
}

function saveDeployment(deploymentState: {}, outputFile: string) {
  const deploymentStateJSON = JSON.stringify(deploymentState, null, 2);
  fs.writeFileSync(outputFile, deploymentStateJSON);
}

export function loadPreviousDeployment(
  network: string
): Record<string, DeploymentStateItem> {
  let previousDeployment = {};
  const outputFile = `${outputDir}/${network}.json`;
  if (fs.existsSync(outputFile)) {
    console.log(`Loading previous deployment...`);
    previousDeployment = require("../" + outputFile);
  }

  return previousDeployment;
}

export async function verifyContract(
  id: string,
  network: string,
  address: string,
  constructorArguments: any = [],
  deploymentState: Record<string, DeploymentStateItem>
) {
  const ETHERSCAN_BASE_URL =
    process.env[`${network.toUpperCase()}_ETHERSCAN_BASE_URL`];
  const outputFile = `${outputDir}/${network}.json`;
  let proxyAddress = ZERO_ADDRESS;
  let implAddress = await getProxyImpl(address);
  if (implAddress != ZERO_ADDRESS) {
    proxyAddress = address;
    address = implAddress;
    constructorArguments = [];
  } else {
    proxyAddress == ZERO_ADDRESS;
  }

  if (
    address != ZERO_ADDRESS &&
    (!deploymentState[id] || !deploymentState[id].verification)
  ) {
    let varified = await verify(address, constructorArguments);
    if (varified) {
      deploymentState[
        id
      ].verification = `${ETHERSCAN_BASE_URL}/address/${address}#code`;
    }
  }
  if (
    proxyAddress != ZERO_ADDRESS &&
    (!deploymentState[id] || !deploymentState[id].proxyVerification)
  ) {
    let varified = await verify(proxyAddress);
    if (varified) {
      deploymentState[
        id
      ].proxyVerification = `${ETHERSCAN_BASE_URL}/address/${proxyAddress}#code`;
    }
  }
  saveDeployment(deploymentState, outputFile);
}

export async function verify(address: string, constructorArguments: any = []) {
  if (address == ZERO_ADDRESS) {
    return false;
  }
  console.log(`Verify contract: ${address}`);
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
    });
    return true;
  } catch (error: unknown) {
    // if it was already verified, it’s like a success, so let’s move forward and save it
    if (error instanceof NomicLabsHardhatPluginError) {
      //return true;
    }
    console.error(error);
    return false;
  }
}

async function getProxyImpl(address: string) {
  const implHex = await hre.ethers.provider.getStorageAt(
    address,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  return hre.ethers.utils.hexZeroPad(
    hre.ethers.utils.hexStripZeros(implHex),
    20
  );
}

export async function waitForTx(tx: ContractTransaction) {
  await tx.wait();
}
