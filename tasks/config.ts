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

task("LockupBend:createLock", "LockupBend createLock").setAction(
  async ({}, { network, ethers, upgrades }) => {
    const [deployer] = await ethers.getSigners();

    let utils = await import("../scripts/utils");

    const deploymentState = utils.loadPreviousDeployment(network.name);
    const lockupBend = await utils.load(
      "LockupBendFactory",
      deployer,
      deploymentState
    );
    // utils.waitForTx(
    //   await lockupBend.createLock(
    //     [
    //       ["0x94E84BeedB2CB25c8b644e5379F3be3BeA57dC7a", utils.makeBN(1050)], // yuankui
    //       ["0xBD8F7A45b576E5a5EC4d77036452040E8C0a691D", utils.makeBN(150)],
    //       ["0x390F8f744306999BD1aE0a260Dc2088B599f125a", utils.makeBN(350)],
    //       ["0x8b04B42962BeCb429a4dBFb5025b66D3d7D31d27", utils.makeBN(1750)], // zhijie
    //       ["0xf2B40B2c5858dB024901fE3346EFcc08d758ed2D", utils.makeBN(2150)], // wenchao
    //       ["0x60cAB66B021f13aa7D581364559D9D5Bd797c34C", utils.makeBN(1400)], // jiapeng
    //       ["0x47c571c8f67fbbf940de26f6a27a36f14a91bca8", utils.makeBN(550)], // allen
    //       ["0xE5904695748fe4A84b40b3fc79De2277660BD1D3", utils.makeBN(750)],
    //       ["0x668417616f1502D13EA1f9528F83072A133e8E01", utils.makeBN(1850)],
    //     ],
    //     utils.makeBN18(210000)
    //   )
    // );
  }
);
