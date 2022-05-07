import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, constants } from "ethers";
import {
  deployStakedBUNI,
  deployVault,
  deployBendTokenTester,
  deployContract,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  compareRewardsAtAction,
  getUserIndex,
  getRewards,
  compareRewardsAtTransfer,
} from "../testHelper";

import {
  mineBlockAndIncreaseTime,
  makeBN18,
  Snapshots,
  assertAlmostEqual,
} from "../utils";
import fc from "fast-check";
fc.configureGlobal({
  numRuns: 10,
});
describe("StakedBUNI tests", function () {
  let bendToken: Contract;
  let vault: Contract;
  let stakedBUNI: Contract;
  let uniToken: Contract;
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
  let users: SignerWithAddress[];

  const snapshots = new Snapshots();

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    bendToken = await deployBendTokenTester(deployer, makeBN18(100000000));
    vault = await deployVault(bendToken);
    await bendToken.transfer(vault.address, makeBN18(10000000));
    uniToken = await deployContract("ERC20Mock", ["BEND/ETH UNI", "BUNI"]);

    stakedBUNI = await deployStakedBUNI(
      uniToken,
      bendToken,
      vault,
      makeBN18(1000000)
    );
    staker = users[0];
    await uniToken.setBalance(staker.address, makeBN18(100));

    await vault.approve(stakedBUNI.address, constants.MaxUint256);

    await uniToken
      .connect(staker)
      .approve(stakedBUNI.address, constants.MaxUint256);

    await stakedBUNI.configure(100);
    await snapshots.capture("init");
  });

  function makeSuite(name: string, tests: Function) {
    describe(name, () => {
      tests();
      after(async () => {
        await snapshots.revert("init");
      });
    });
  }

  makeSuite("#stake", () => {
    it("Initial configuration after initialize() is correct", async () => {
      expect(await stakedBUNI.name()).to.be.eq("Staked BEND/ETH UNI");
      expect(await stakedBUNI.symbol()).to.be.eq("stkBUNI");
      expect(await stakedBUNI.decimals()).to.be.eq(18);
      expect(await stakedBUNI.stakedToken()).to.be.eq(uniToken.address);
      expect(await stakedBUNI.rewardToken()).to.be.eq(bendToken.address);
      expect(await stakedBUNI.rewardVault()).to.be.eq(vault.address);
    });

    it("Reverts trying to stake 0 amount", async () => {
      const amount = "0";
      await expect(stakedBUNI.connect(staker).stake(amount)).to.be.revertedWith(
        "INVALID_ZERO_AMOUNT"
      );
    });

    it("User 1 stakes 50 UNI: receives 50 stkBUNI, StakedBUNI balance of UNI is 50 and his rewards to claim are 0", async () => {
      const amount = makeBN18(50);

      const stkBUNIBalanceBefore = await stakedBUNI.balanceOf(staker.address);
      const uniBalanceBefore = await uniToken.balanceOf(stakedBUNI.address);

      // Prepare actions for the test case
      const action = async () => {
        await stakedBUNI.connect(staker).stake(amount);
      };

      // Check rewards
      await compareRewardsAtAction(stakedBUNI, staker.address, action, false);

      //Stake token tests
      expect(await stakedBUNI.balanceOf(staker.address)).to.be.eq(
        stkBUNIBalanceBefore.add(amount)
      );
      expect(await uniToken.balanceOf(stakedBUNI.address)).to.be.eq(
        uniBalanceBefore.add(amount)
      );
    });

    it("User 1 stakes 20 UNI more: his total stkBUNI balance increases, StakedBUNI balance of UNI increases and his reward until now get accumulated", async () => {
      const amount = makeBN18(20);

      const stkBUNIBalanceBefore = await stakedBUNI.balanceOf(staker.address);
      const uniBalanceBefore = await uniToken.balanceOf(stakedBUNI.address);
      const action = async () => {
        await stakedBUNI.connect(staker).stake(amount);
      };

      // Checks rewards
      await compareRewardsAtAction(stakedBUNI, staker.address, action, true);

      // Extra test checks
      expect(await stakedBUNI.balanceOf(staker.address)).to.be.eq(
        stkBUNIBalanceBefore.add(amount)
      );
      expect(await uniToken.balanceOf(stakedBUNI.address)).to.be.eq(
        uniBalanceBefore.add(amount)
      );
    });

    it("User 1 claim half rewards ", async () => {
      // Increase time for bigger rewards
      await mineBlockAndIncreaseTime(1000);

      const halfRewards = (
        await stakedBUNI.stakerRewardsToClaim(staker.address)
      ).div(2);
      const bendBalanceBefore = await bendToken.balanceOf(staker.address);

      await stakedBUNI.connect(staker).claim(halfRewards);

      const bendBalanceAfter = await bendToken.balanceOf(staker.address);
      expect(bendBalanceAfter).to.be.eq(bendBalanceBefore.add(halfRewards));
    });

    it("User 1 tries to claim higher reward than current rewards balance", async () => {
      const staker = users[0];

      const saveUserBalance = await bendToken.balanceOf(staker.address);

      // Try to claim more amount than accumulated
      await expect(
        stakedBUNI.connect(staker).claim(makeBN18(10000))
      ).to.be.revertedWith("INVALID_AMOUNT");

      const userBalanceAfterActions = await bendToken.balanceOf(staker.address);
      expect(userBalanceAfterActions).to.be.eq(saveUserBalance);
    });

    it("User 1 claim all rewards", async () => {
      const userAddress = staker.address;
      const underlyingAsset = stakedBUNI.address;

      const userStkBUNIBalance = await stakedBUNI.balanceOf(userAddress);
      const userBendBalance = await bendToken.balanceOf(userAddress);
      const userRewards = await stakedBUNI.stakerRewardsToClaim(userAddress);
      const userAllRewards = await stakedBUNI.claimableRewards(userAddress);
      // Get index before actions
      const userIndexBefore = await getUserIndex(
        stakedBUNI,
        userAddress,
        underlyingAsset
      );

      // Claim rewards
      await expect(
        stakedBUNI.connect(staker).claim(constants.MaxUint256.sub(1000))
      ).to.revertedWith("INVALID_AMOUNT");

      await expect(
        stakedBUNI.connect(staker).claim(constants.MaxUint256)
      ).to.emit(stakedBUNI, "RewardsClaimed");

      // Get index after actions
      const userIndexAfter = await getUserIndex(
        stakedBUNI,
        userAddress,
        underlyingAsset
      );

      const expectedAccruedRewards = getRewards(
        userStkBUNIBalance,
        userIndexAfter,
        userIndexBefore
      );
      const userBendBalanceAfter = await bendToken.balanceOf(userAddress);
      expect(userAllRewards).to.be.lte(userRewards.add(expectedAccruedRewards));
      assertAlmostEqual(
        userBendBalanceAfter,
        userBendBalance.add(userRewards).add(expectedAccruedRewards)
      );
    });

    it("User 6 stakes 50 UNI, with the rewards not enabled", async () => {
      const sixStaker = users[5];

      await uniToken
        .connect(sixStaker)
        .approve(stakedBUNI.address, constants.MaxUint256);
      await uniToken.setBalance(sixStaker.address, makeBN18(100));
      const amount = makeBN18(50);

      const action = async () => {
        await stakedBUNI.connect(sixStaker).stake(amount);
      };

      await compareRewardsAtAction(
        stakedBUNI,
        sixStaker.address,
        action,
        false,
        0
      );

      // Check expected stake balance for six staker
      expect(await stakedBUNI.balanceOf(sixStaker.address)).to.be.eq(amount);

      // Expect rewards balance to still be zero
      const rewardsBalance = await await stakedBUNI.claimableRewards(
        sixStaker.address
      );
      expect(rewardsBalance).to.be.eq(0);
    });

    it("User 6 stakes 30 UNI more, with the rewards not enabled", async () => {
      const amount = makeBN18(30);
      const sixStaker = users[5];
      // Checks rewards
      const action = async () => {
        await stakedBUNI.connect(sixStaker).stake(amount);
      };

      await compareRewardsAtAction(
        stakedBUNI,
        sixStaker.address,
        action,
        false,
        0
      );

      // Expect rewards balance to still be zero
      const rewardsBalance = await await stakedBUNI.claimableRewards(
        sixStaker.address
      );
      expect(rewardsBalance).to.be.eq(0);
    });
  });
  makeSuite("#redeem", () => {
    it("Reverts trying to redeem 0 amount", async () => {
      const amount = 0;

      await expect(
        stakedBUNI.connect(staker).redeem(amount)
      ).to.be.revertedWith("INVALID_ZERO_AMOUNT");
    });

    it("User 1 stakes UNI and tries to redeem", async () => {
      let amount = makeBN18(50);

      await stakedBUNI.connect(staker).stake(amount);
      amount = makeBN18(1000);

      const uniBalanceBefore = await uniToken.balanceOf(staker.address);
      const stakedBUNIBalanceBefore = await stakedBUNI.balanceOf(
        staker.address
      );

      await stakedBUNI.connect(staker).redeem(amount);
      const uniBalanceAfter = await uniToken.balanceOf(staker.address);
      const stakedBUNIBalanceAfter = await stakedBUNI.balanceOf(staker.address);

      let uniRecieved = uniBalanceAfter.sub(uniBalanceBefore);
      let stakedBUNIRedeemed = stakedBUNIBalanceBefore.sub(
        stakedBUNIBalanceAfter
      );

      expect(uniRecieved).to.be.eq(stakedBUNIRedeemed);
      expect(stakedBUNIBalanceAfter).to.be.eq(0);
    });
  });

  makeSuite("#transfer", () => {
    it("User 1 stakes 50 UNI", async () => {
      const amount = makeBN18(50);

      const action = async () => {
        await stakedBUNI.connect(staker).stake(amount);
      };

      await compareRewardsAtAction(stakedBUNI, staker.address, action, false);
    });

    it("User 1 transfers 50 stkBUNI to User 5", async () => {
      const amount = makeBN18(50);
      const receiver = users[4];

      await compareRewardsAtTransfer(
        stakedBUNI,
        staker,
        receiver,
        amount,
        true,
        false
      );
    });

    it("User 5 transfers 50 stkBUNI to himself", async () => {
      const amount = makeBN18(50);
      const sender = users[4];
      await compareRewardsAtTransfer(
        stakedBUNI,
        sender,
        sender,
        amount,
        true,
        true
      );
    });

    it("User 5 transfers 50 stkBUNI to user 2", async () => {
      const amount = makeBN18(50);
      const sender = users[4];
      const receiver = users[1];

      await compareRewardsAtTransfer(
        stakedBUNI,
        sender,
        receiver,
        amount,
        true,
        false
      );
    });

    it("User 4 stakes and transfers 50 stkBUNI to user 2", async () => {
      const amount = makeBN18(50);
      const sender = users[3];
      const receiver = users[1];

      await uniToken.setBalance(sender.address, makeBN18(100));
      await uniToken
        .connect(sender)
        .approve(stakedBUNI.address, constants.MaxUint256);
      const action = async () => {
        await stakedBUNI.connect(sender).stake(amount);
      };

      await compareRewardsAtAction(stakedBUNI, sender.address, action, false);
      await compareRewardsAtTransfer(
        stakedBUNI,
        sender,
        receiver,
        amount,
        true,
        true
      );
    });
  });
});
