import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import {
  deployBendToken,
  deployIncentivesController,
  deployContract,
  deployVault,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  makeBN18,
  timeLatest,
  mineBlockAndIncreaseTime,
  makeBN,
  waitForTx,
  timeAtBlock,
  mineBlockAtTime,
} from "../utils";
import {
  getAssetsData,
  getNormalizedDistribution,
  getRewards,
  getUserIndex,
} from "../testHelper";

type ScenarioAction = {
  caseName: string;
  emissionPerSecond: string;
};

const getRewardsBalanceScenarios: ScenarioAction[] = [
  {
    caseName: "Accrued rewards are 0",
    emissionPerSecond: "0",
  },
  {
    caseName: "Accrued rewards are not 0",
    emissionPerSecond: "2432424",
  },
  {
    caseName: "Accrued rewards are not 0",
    emissionPerSecond: "2432424",
  },
];

describe("BendProtocolIncentivesController getRewardsBalance tests", function () {
  let bendToken: Contract;
  let incentivesController: Contract;
  let bWeth: Contract;
  let deployer: SignerWithAddress;
  let deployTime: BigNumber;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);

    bendToken = await deployBendToken(deployer, makeBN18(1000000));
    const vault = await deployVault(bendToken);
    await bendToken.transfer(vault.address, makeBN18(1000000));
    incentivesController = await deployIncentivesController(bendToken, vault);

    deployTime = await timeLatest();
    bWeth = await deployContract("BTokenIncentiveTester", [
      "bWETH",
      "bWETH",
      incentivesController.address,
    ]);
  });
  let totalSupply = makeBN(0);
  for (const { caseName, emissionPerSecond } of getRewardsBalanceScenarios) {
    it(caseName, async () => {
      await mineBlockAndIncreaseTime(100);

      const distributionEndTimestamp =
        await incentivesController.DISTRIBUTION_END();
      const userAddress = users[1].address;
      const underlyingAsset = bWeth.address;

      // update emissionPerSecond in advance to not affect user calculations
      if (emissionPerSecond) {
        await incentivesController.configureAssets(
          [underlyingAsset],
          [emissionPerSecond]
        );
      }
      await mineBlockAtTime((await timeLatest()).add(100).toNumber());
      const balance = makeBN(Math.floor(Math.random() * 100000000));
      totalSupply = totalSupply.add(balance);

      const lastTxReceipt = await waitForTx(
        await bWeth.mint(userAddress, balance)
      );
      const lastTxTimestamp = await timeAtBlock(lastTxReceipt.blockNumber);

      const unclaimedRewardsBefore =
        await incentivesController.getUserUnclaimedRewards(userAddress);

      const unclaimedRewards = await incentivesController.getRewardsBalance(
        [underlyingAsset],
        userAddress
      );

      const userIndex = await getUserIndex(
        incentivesController,
        userAddress,
        underlyingAsset
      );
      const assetData = (
        await getAssetsData(incentivesController, [underlyingAsset])
      )[0];

      const expectedAssetIndex = getNormalizedDistribution(
        totalSupply,
        assetData.index,
        assetData.emissionPerSecond,
        assetData.lastUpdateTimestamp,
        lastTxTimestamp,
        distributionEndTimestamp
      );
      const expectedAccruedRewards = getRewards(
        balance,
        expectedAssetIndex,
        userIndex
      );

      expect(unclaimedRewards).to.be.equal(
        unclaimedRewardsBefore.add(expectedAccruedRewards)
      );
    });
  }
});
