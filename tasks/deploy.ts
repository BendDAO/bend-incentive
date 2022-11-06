import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";

import dotenv from "dotenv";

const envResult = dotenv.config();
if (envResult.error || !envResult.parsed) {
  throw envResult.error;
}
const env = envResult.parsed;
//console.log("ENV:", env);

task("deploy:BendToken", "Deploy BendToken").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    const envInitKey = `${network.name}_BEND_TOKEN_INIT_ADDRESS`.toUpperCase();
    const initAddress = env[envInitKey] ? env[envInitKey] : deployer.address;
    console.log("Token Init Address:", env[envInitKey], initAddress);

    const maxSupply = ethers.utils.parseUnits(
      constants.BEND_TOKEN_MAX_SUPPLY.toString(),
      18
    );

    const bendToken = await utils.loadOrDeploy(
      "BendToken",
      [initAddress, maxSupply],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:Vault", "Deploy Vault").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    let bendToken = deploymentState["BendToken"];

    const vault = await utils.loadOrDeploy(
      "Vault",
      [bendToken.address],
      network.name,
      deployer,
      deploymentState,
      {
        proxy: true,
      }
    );
  }
);

task("deploy:IncentivesController", "Deploy IncentivesController").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    let bendToken = deploymentState["BendToken"];
    let vault = deploymentState["Vault"];

    const incentivesController = await utils.loadOrDeploy(
      "BendProtocolIncentivesController",
      [bendToken.address, vault.address, constants.ONE_YEAR * 10],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:Airdrop", "Deploy Airdrop").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    let bendToken = deploymentState["BendToken"];

    const airdrop = await utils.loadOrDeploy(
      "MerkleDistributor",
      [bendToken.address],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:VeBend", "Deploy veBEND").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    let bendToken = deploymentState["BendToken"];

    const vebend = await utils.loadOrDeploy(
      "VeBend",
      [bendToken.address],
      network.name,
      deployer,
      deploymentState,
      {
        proxy: true,
      }
    );
  }
);

task("deploy:FeeDistributor", "Deploy FeeDistributor").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);

    let vebend = deploymentState["VeBend"];

    let [WETH, bWETH, addressesProvider, bendCollector] =
      constants.getFeeDistributorParams(network.name);
    console.log(
      "WETH:",
      WETH,
      "bWETH:",
      bWETH,
      "addressesProvider:",
      addressesProvider,
      "bendCollector:",
      bendCollector
    );
    const feeDistributor = await utils.loadOrDeploy(
      "FeeDistributor",
      [WETH, bWETH, vebend.address, addressesProvider, bendCollector],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:StakedBUNI", "Deploy StakedBUNI").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    let uni = constants.getBendEthUni(network.name);
    let bendToken = deploymentState["BendToken"].address;
    let vault = deploymentState["Vault"].address;
    console.log("uni:", uni, "bendToken:", bendToken, "vault:", vault);
    await utils.loadOrDeploy(
      "StakedBUNI",
      [uni, bendToken, vault, constants.ONE_YEAR * 3],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:LockupBendFactory", "Deploy LockupBendFactory").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let constants = await import("../scripts/constants");
    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    await utils.loadOrDeploy(
      "LockupBendFactory",
      [
        constants.getWETH(network.name),
        deploymentState["BendToken"].address,
        deploymentState["VeBend"].address,
        deploymentState["FeeDistributor"].address,
        constants.getSnapshotDelatation(network.name),
      ],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:FeeCollector", "Deploy FeeCollector").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let utils = await import("../scripts/utils");
    let constants = await import("../scripts/constants");
    const deploymentState = utils.loadPreviousDeployment(network.name);
    await utils.loadOrDeploy(
      "FeeCollector",
      [
        constants.getWETH(network.name),
        constants.getBWETH(network.name),
        constants.getTreasury(network.name),
        constants.getBendCollector(network.name),
        constants.getLendPoolAddressesProvider(network.name),
      ],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);

task("deploy:BendKeeper", "Deploy BendKeeper").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    await utils.loadOrDeploy(
      "BendKeeper",
      [
        deploymentState["FeeDistributor"].address,
        deploymentState["FeeCollector"].address,
      ],
      network.name,
      deployer,
      deploymentState
    );
  }
);
