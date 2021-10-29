import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import {
  deployStakedToken,
  deployIncentivesController,
  deployContract,
  deployVault,
} from "../deployHelper";
import { ONE_YEAR } from "../constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { makeBN18, timeLatest, waitForTx, assertAlmostEqual } from "../utils";

describe("StakedTokenIncentivesController tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
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
    vault = await deployVault();
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer.address
    ));
    incentivesController = await deployIncentivesController(
      bendToken,
      stakedToken,
      vault,
      deployer.address
    );
    bWeth = await deployContract("BTokenMock", [
      "bWETH",
      "bWETH",
      incentivesController.address,
    ]);
    deployTime = await timeLatest();
  });

  it("should assign correct params", async () => {
    expect(await incentivesController.REWARD_TOKEN()).to.be.equal(
      stakedToken.address
    );
    expect(await incentivesController.STAKE_TOKEN()).to.be.equal(
      stakedToken.address
    );
    expect(await incentivesController.REWARDS_VAULT()).to.be.equal(
      vault.address
    );
    expect(await incentivesController.EMISSION_MANAGER()).to.be.equal(
      deployer.address
    );
    assertAlmostEqual(
      await incentivesController.DISTRIBUTION_END(),
      deployTime.add(ONE_YEAR * 100),
      5
    );
  });
});
