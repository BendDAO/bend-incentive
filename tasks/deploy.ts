import "@openzeppelin/hardhat-upgrades";
import { task } from "hardhat/config";

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

task("deploy:BendKeeper", "Deploy BendKeeper").setAction(
  async ({}, { network, ethers, upgrades, run }) => {
    await run("compile");
    const [deployer] = await ethers.getSigners();

    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    await utils.loadOrDeploy(
      "BendKeeper",
      [deploymentState["FeeDistributor"].address, deploymentState["FeeCollector"].address],
      network.name,
      deployer,
      deploymentState
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
        constants.getTreasury(network.name),
        deploymentState["FeeDistributor"].address,
      ],
      network.name,
      deployer,
      deploymentState,
      { proxy: true }
    );
  }
);
