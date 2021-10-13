const hre = require("hardhat");
const fs = require("fs");
const outputDir = "./deployments";

async function loadOrDeploy(
  name,
  params,
  network,
  deployer,
  deploymentState,
  options
) {
  options = {
    id: name,
    proxy: false,
    proxyInitializer: undefined,
    verify: true,
    ...options,
  };
  const verify = async function (contract) {
    if (options.verify) {
      let address = contract.address;
      if (options.proxy) {
        address = await getProxyImpl(contract.address);
      }
      verifyContract(address, params);
    }
  };
  const factory = await hre.ethers.getContractFactory(name);
  const id = options.id;
  if (deploymentState[id] && deploymentState[id].address) {
    console.log(
      `Using previously deployed ${id} contract at address ${deploymentState[id].address}`
    );
    const contract = new hre.ethers.Contract(
      deploymentState[id].address,
      factory.interface,
      deployer
    );

    verify(contract);
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
  const outputFile = `${outputDir}/${network}.json`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  saveDeployment(deploymentState, outputFile);

  verify(contract);
  return contract;
}

function saveDeployment(deploymentState, outputFile) {
  const deploymentStateJSON = JSON.stringify(deploymentState, null, 2);
  fs.writeFileSync(outputFile, deploymentStateJSON);
}

function loadPreviousDeployment(network) {
  let previousDeployment = {};
  const outputFile = `${outputDir}/${network}.json`;
  if (fs.existsSync(outputFile)) {
    console.log(`Loading previous deployment...`);
    previousDeployment = require("../" + outputFile);
  }

  return previousDeployment;
}

async function verifyContract(address, constructorArguments) {
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

async function getProxyImpl(address) {
  const implHex = await hre.ethers.provider.getStorageAt(
    address,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  return hre.ethers.utils.hexStripZeros(implHex);
}

async function waitForTx(tx) {
  await tx.wait();
}

module.exports = {
  verifyContract: verifyContract,
  loadOrDeploy: loadOrDeploy,
  loadPreviousDeployment: loadPreviousDeployment,
  getProxyImpl: getProxyImpl,
  waitForTx: waitForTx,
};
