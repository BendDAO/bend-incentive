import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import {
  deployBendToken,
  deployIncentivesController,
  deployContract,
  deployVault,
} from "../deployHelper";
import { ONE_YEAR } from "../constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { makeBN18, timeLatest, waitForTx, assertAlmostEqual } from "../utils";

describe("BendProtocolIncentivesController tests", function () {
  let bendToken: Contract;
  let incentivesController: Contract;
  let bWeth: Contract;
  let deployer: SignerWithAddress;
  let deployTime: BigNumber;
  let vault: Contract;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    bendToken = await deployBendToken(deployer, makeBN18(1000000));
    vault = await deployVault(bendToken);
    await bendToken.transfer(vault.address, makeBN18(1000000));
    incentivesController = await deployIncentivesController(bendToken, vault);
    bWeth = await deployContract("BTokenIncentiveTester", [
      "bWETH",
      "bWETH",
      incentivesController.address,
    ]);
    deployTime = await timeLatest();
  });

  it("should assign correct params", async () => {
    expect(await incentivesController.REWARD_TOKEN()).to.be.equal(
      bendToken.address
    );
    expect(await incentivesController.REWARDS_VAULT()).to.be.equal(
      vault.address
    );
    expect(await incentivesController.owner()).to.be.equal(deployer.address);
    assertAlmostEqual(
      await incentivesController.DISTRIBUTION_END(),
      deployTime.add(ONE_YEAR * 100),
      5
    );
  });
});
