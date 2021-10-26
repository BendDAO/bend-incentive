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
  emissionPerSecond: number;
  amountToClaim: BigNumber | number;
};

const getRewardsBalanceScenarios: ScenarioAction[] = [
  {
    caseName: "Accrued rewards are 0, claim 0",
    emissionPerSecond: 0,
    amountToClaim: 0,
  },
  {
    caseName: "Accrued rewards are 0, claim not 0",
    emissionPerSecond: 0,
    amountToClaim: 100,
  },
  {
    caseName: "Accrued rewards are not 0",
    emissionPerSecond: 2432424,
    amountToClaim: 10,
  },
  {
    caseName: "Should allow -1",
    emissionPerSecond: 2432424,
    amountToClaim: makeBN(MAX_UINT_AMOUNT),
  },
  {
    caseName:
      "Should withdraw everything if amountToClaim more then rewards balance",
    emissionPerSecond: 100,
    amountToClaim: 1034,
  },
  {
    caseName: "Should withdraw to another user",
    emissionPerSecond: 100,
    amountToClaim: 1034,
  },
  {
    caseName: "Should withdraw to another user and stake",
    emissionPerSecond: 100,
    amountToClaim: 1034,
  },
];

describe("StakedTokenIncentivesController claimRewards tests", function () {
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
  for (const {
    caseName,
    amountToClaim,
    emissionPerSecond,
  } of getRewardsBalanceScenarios) {
    it(caseName, async () => {
      await mineBlockAndIncreaseTime(100);
      const userAddress = users[0].address;
      const underlyingAsset = bWeth.address;
      const stakedByUser = makeBN(22 * caseName.length);
      const totalStaked = makeBN(33 * caseName.length);

      if (emissionPerSecond) {
        await incentivesController.configureAssets(
          [underlyingAsset],
          [emissionPerSecond]
        );
      }

      const userBalanceBefore = await stakedToken.balanceOf(userAddress);
      await bWeth.setUserBalanceAndSupply(
        userAddress,
        stakedByUser,
        totalStaked
      );
      await bWeth.handleActionOnAic(userAddress, totalStaked, stakedByUser);

      const unclaimedRewardsBefore =
        await incentivesController.getRewardsBalance(
          [underlyingAsset],
          userAddress
        );
      const userIndexBefore = await getUserIndex(
        incentivesController,
        userAddress,
        underlyingAsset
      );
      const assetDataBefore = (
        await getAssetsData(incentivesController, [underlyingAsset])
      )[0];

      const tx = await incentivesController
        .connect(users[0])
        .claimRewards([underlyingAsset], amountToClaim);
      const claimRewardsReceipt = await waitForTx(tx);

      const eventsEmitted = claimRewardsReceipt.events || [];

      const actionBlockTimestamp = await getBlockTimestamp(
        claimRewardsReceipt.blockNumber
      );

      const userIndexAfter = await getUserIndex(
        incentivesController,
        userAddress,
        underlyingAsset
      );
      const assetDataAfter = (
        await getAssetsData(incentivesController, [underlyingAsset])
      )[0];

      const unclaimedRewardsAfter =
        await incentivesController.getRewardsBalance(
          [underlyingAsset],
          userAddress
        );

      const userBalanceAfter = await stakedToken.balanceOf(userAddress);

      const claimedAmount = userBalanceAfter.sub(userBalanceBefore);

      const expectedAccruedRewards = getRewards(
        stakedByUser,
        userIndexAfter,
        userIndexBefore
      );

      if (amountToClaim == 0) {
        // state should not change
        expect(userIndexBefore).to.be.equal(
          userIndexAfter,
          "userIndexAfter should not change"
        );
        expect(unclaimedRewardsBefore).to.be.equal(
          unclaimedRewardsAfter,
          "unclaimedRewards should not change"
        );
        expect(userBalanceBefore).to.be.equal(
          userBalanceAfter,
          "userBalance should not change"
        );
        expect(assetDataAfter.emissionPerSecond).to.be.equal(
          assetDataBefore.emissionPerSecond,
          "emissionPerSecond should not change"
        );
        expect(assetDataAfter.index).to.be.equal(
          assetDataBefore.index,
          "index should not change"
        );
        expect(assetDataAfter.lastUpdateTimestamp).to.be.equal(
          assetDataBefore.lastUpdateTimestamp,
          "lastUpdateTimestamp should not change"
        );
        expect(eventsEmitted.length).to.be.equal(
          0,
          "no events should be emitted"
        );
        return;
      }

      // ------- Distribution Manager tests START -----

      if (!assetDataAfter.index.eq(assetDataBefore.index)) {
        expect(tx)
          .to.emit(incentivesController, "AssetIndexUpdated")
          .withArgs(assetDataAfter.underlyingAsset, assetDataAfter.index);

        expect(tx)
          .to.emit(incentivesController, "UserIndexUpdated")
          .withArgs(
            userAddress,
            assetDataAfter.underlyingAsset,
            userIndexAfter
          );
      }
      expect(assetDataAfter.lastUpdateTimestamp).to.eq(actionBlockTimestamp);
      expect(assetDataAfter.index).to.eq(
        getNormalizedDistribution(
          totalStaked,
          assetDataBefore.index,
          assetDataBefore.emissionPerSecond,
          assetDataBefore.lastUpdateTimestamp,
          actionBlockTimestamp,
          await incentivesController.DISTRIBUTION_END()
        )
      );

      expect(userIndexAfter).to.be.equal(
        assetDataAfter.index,
        "user index are not correctly updated"
      );
      // ------- Distribution Manager tests END -----

      let unclaimedRewardsCalc = unclaimedRewardsBefore.add(
        expectedAccruedRewards
      );

      let expectedClaimedAmount: BigNumber;
      if (unclaimedRewardsCalc.lte(amountToClaim)) {
        expectedClaimedAmount = unclaimedRewardsCalc;
        expect(unclaimedRewardsAfter).to.be.equal(
          0,
          "unclaimed amount after should go to 0"
        );
      } else {
        expectedClaimedAmount = BigNumber.from(amountToClaim);
        expect(unclaimedRewardsAfter).to.be.equal(
          unclaimedRewardsCalc.sub(amountToClaim),
          "unclaimed rewards after are wrong"
        );
      }

      expect(claimedAmount).to.be.equal(
        expectedClaimedAmount,
        "claimed amount are wrong"
      );
      if (!expectedAccruedRewards.eq(0)) {
        expect(tx)
          .to.emit(incentivesController, "RewardsAccrued")
          .withArgs(userAddress, expectedAccruedRewards);
      }
      if (expectedClaimedAmount.gt(0)) {
        expect(tx)
          .to.emit(incentivesController, "RewardsClaimed")
          .withArgs(userAddress, expectedClaimedAmount);
      }
    });
  }
});