import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import {
  deployStakedToken,
  deployIncentivesController,
  deployContract,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  makeBN18,
  timeLatest,
  mineBlockAndIncreaseTime,
  makeBN,
  waitForTx,
  getBlockTimestamp,
  mineBlockAtTime,
} from "../utils";
import {
  getAssetsData,
  getNormalizedDistribution,
  getRewards,
  getUserIndex,
} from "../testHelper";
import { MAX_UINT_AMOUNT } from "../constants";

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

describe("StakedTokenIncentivesController getRewardsBalance tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let incentivesController: Contract;
  let bWeth: Contract;
  let deployer: SignerWithAddress;
  let deployTime: BigNumber;
  let vault: SignerWithAddress;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer, vault] = addresses;
    users = addresses.slice(2, addresses.length);
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer
    ));
    incentivesController = await deployIncentivesController(
      bendToken,
      stakedToken,
      vault,
      deployer
    );

    deployTime = await timeLatest();
    bWeth = await deployContract("BTokenMock", [
      "bWETH",
      "bWETH",
      incentivesController.address,
    ]);
  });
  for (const { caseName, emissionPerSecond } of getRewardsBalanceScenarios) {
    it(caseName, async () => {
      await mineBlockAndIncreaseTime(100);

      const distributionEndTimestamp =
        await incentivesController.DISTRIBUTION_END();
      const userAddress = users[1].address;
      const stakedByUser = makeBN(22 * caseName.length);
      const totalStaked = makeBN(33 * caseName.length);
      const underlyingAsset = bWeth.address;

      // update emissionPerSecond in advance to not affect user calculations
      await mineBlockAtTime((await timeLatest()).add(100).toNumber());
      if (emissionPerSecond) {
        await bWeth.setUserBalanceAndSupply(userAddress, 0, totalStaked);
        await incentivesController.configureAssets(
          [underlyingAsset],
          [emissionPerSecond]
        );
      }
      await bWeth.handleActionOnAic(userAddress, totalStaked, stakedByUser);
      await mineBlockAtTime((await timeLatest()).add(100).toNumber());

      const lastTxReceipt = await waitForTx(
        await bWeth.setUserBalanceAndSupply(
          userAddress,
          stakedByUser,
          totalStaked
        )
      );
      const lastTxTimestamp = await getBlockTimestamp(
        lastTxReceipt.blockNumber
      );

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
        totalStaked,
        assetData.index,
        assetData.emissionPerSecond,
        assetData.lastUpdateTimestamp,
        lastTxTimestamp,
        distributionEndTimestamp
      );
      const expectedAccruedRewards = getRewards(
        stakedByUser,
        expectedAssetIndex,
        userIndex
      );

      expect(unclaimedRewards).to.be.equal(
        unclaimedRewardsBefore.add(expectedAccruedRewards)
      );
    });
  }
});
