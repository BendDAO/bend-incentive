import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployStakedToken } from "../deployHelper";
import {
  STAKED_TOKEN_NAME,
  STAKED_TOKEN_SYMBOL,
  STAKED_TOKEN_DECIMALS,
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  MAX_UINT_AMOUNT,
} from "../constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  compareRewardsAtAction,
  getUserIndex,
  getRewards,
} from "../testHelper";

import {
  waitForTx,
  mineBlockAndIncreaseTime,
  mineBlockAtTime,
  makeBN18,
  makeBN,
  timeLatest,
  assertAlmostEqual,
} from "../utils";

describe("StakedToken stake tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
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
    staker = users[0];
    await waitForTx(await bendToken.mint(staker.address, makeBN18(100)));
    // console.log(`   ${stakedToken.address}`);
  });

  it("Initial configuration after initialize() is correct", async () => {
    expect(await stakedToken.name()).to.be.eq(STAKED_TOKEN_NAME);
    expect(await stakedToken.symbol()).to.be.eq(STAKED_TOKEN_SYMBOL);
    expect(await stakedToken.decimals()).to.be.eq(STAKED_TOKEN_DECIMALS);
    expect(await stakedToken.STAKED_TOKEN()).to.be.eq(bendToken.address);
    expect(await stakedToken.REWARD_TOKEN()).to.be.eq(bendToken.address);
    expect(await stakedToken.COOLDOWN_SECONDS()).to.be.eq(COOLDOWN_SECONDS);
    expect(await stakedToken.UNSTAKE_WINDOW()).to.be.eq(UNSTAKE_WINDOW);
    expect(await stakedToken.REWARDS_VAULT()).to.be.eq(vault.address);
  });

  it("Reverts trying to stake 0 amount", async () => {
    const amount = "0";
    await expect(
      stakedToken.connect(staker).stake(staker.address, amount)
    ).to.be.revertedWith("INVALID_ZERO_AMOUNT");
  });

  it("Reverts trying to activate cooldown with 0 staked amount", async () => {
    const amount = "0";
    await expect(stakedToken.connect(staker).cooldown()).to.be.revertedWith(
      "INVALID_BALANCE_ON_COOLDOWN"
    );
  });

  it("User 1 stakes 50 AAVE: receives 50 SAAVE, StakedAave balance of AAVE is 50 and his rewards to claim are 0", async () => {
    const amount = makeBN18(50);

    const saveBalanceBefore = await stakedToken.balanceOf(staker.address);

    // Prepare actions for the test case
    const actions = () => [
      bendToken.connect(staker).increaseAllowance(stakedToken.address, amount),
      stakedToken.connect(staker).stake(staker.address, amount),
    ];

    // Check rewards
    await compareRewardsAtAction(stakedToken, staker.address, actions);

    // Stake token tests
    expect(await stakedToken.balanceOf(staker.address)).to.be.eq(
      saveBalanceBefore.add(amount)
    );
    expect(await bendToken.balanceOf(stakedToken.address)).to.be.eq(
      saveBalanceBefore.add(amount)
    );
    expect(await stakedToken.balanceOf(staker.address)).to.be.eq(amount);
    expect(await bendToken.balanceOf(stakedToken.address)).to.be.eq(amount);
  });

  it("User 1 stakes 20 AAVE more: his total SAAVE balance increases, StakedAave balance of Aave increases and his reward until now get accumulated", async () => {
    const amount = makeBN18(20);

    const saveBalanceBefore = await stakedToken.balanceOf(staker.address);
    const actions = () => [
      bendToken.connect(staker).increaseAllowance(stakedToken.address, amount),
      stakedToken.connect(staker).stake(staker.address, amount),
    ];

    // Checks rewards
    await compareRewardsAtAction(stakedToken, staker.address, actions, true);

    // Extra test checks
    expect(await stakedToken.balanceOf(staker.address)).to.be.eq(
      saveBalanceBefore.add(amount)
    );
    expect(await bendToken.balanceOf(stakedToken.address)).to.be.eq(
      saveBalanceBefore.add(amount)
    );
  });

  it("User 1 claim half rewards ", async () => {
    // Increase time for bigger rewards
    await mineBlockAndIncreaseTime(1000);

    const halfRewards = (
      await stakedToken.stakerRewardsToClaim(staker.address)
    ).div(2);
    const saveUserBalance = await bendToken.balanceOf(staker.address);

    await stakedToken.connect(staker).claimRewards(staker.address, halfRewards);

    const userBalanceAfterActions = await bendToken.balanceOf(staker.address);
    expect(userBalanceAfterActions).to.be.eq(saveUserBalance.add(halfRewards));
  });

  it("User 1 tries to claim higher reward than current rewards balance", async () => {
    const staker = users[0];

    const saveUserBalance = await bendToken.balanceOf(staker.address);

    // Try to claim more amount than accumulated
    await expect(
      stakedToken.connect(staker).claimRewards(staker.address, makeBN18(10000))
    ).to.be.revertedWith("INVALID_AMOUNT");

    const userBalanceAfterActions = await bendToken.balanceOf(staker.address);
    expect(userBalanceAfterActions).to.be.eq(saveUserBalance);
  });

  it("User 1 claim all rewards", async () => {
    const staker = users[0];

    const userAddress = staker.address;
    const underlyingAsset = stakedToken.address;

    const userBalance = await stakedToken.balanceOf(userAddress);
    const userAaveBalance = await bendToken.balanceOf(userAddress);
    const userRewards = await stakedToken.stakerRewardsToClaim(userAddress);
    // Get index before actions
    const userIndexBefore = await getUserIndex(
      stakedToken,
      userAddress,
      underlyingAsset
    );

    // Claim rewards
    expect(
      stakedToken.connect(staker).claimRewards(staker.address, MAX_UINT_AMOUNT)
    );

    // Get index after actions
    const userIndexAfter = await getUserIndex(
      stakedToken,
      userAddress,
      underlyingAsset
    );

    const expectedAccruedRewards = getRewards(
      userBalance,
      userIndexAfter,
      userIndexBefore
    );
    const userAaveBalanceAfterAction = await bendToken.balanceOf(userAddress);
    assertAlmostEqual(
      userAaveBalanceAfterAction,
      userAaveBalance.add(userRewards).add(expectedAccruedRewards)
    );
  });

  it("User 6 stakes 50 AAVE, with the rewards not enabled", async () => {
    const sixStaker = users[5];
    await waitForTx(await bendToken.mint(sixStaker.address, makeBN18(100)));
    const amount = makeBN18(50);

    // Disable rewards via config
    const assetsConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    // Checks rewards
    const actions = () => [
      bendToken
        .connect(sixStaker)
        .increaseAllowance(stakedToken.address, amount),
      stakedToken.connect(sixStaker).stake(sixStaker.address, amount),
    ];

    await compareRewardsAtAction(
      stakedToken,
      sixStaker.address,
      actions,
      false,
      assetsConfig
    );

    // Check expected stake balance for six staker
    expect(await stakedToken.balanceOf(sixStaker.address)).to.be.eq(amount);

    // Expect rewards balance to still be zero
    const rewardsBalance = await await stakedToken.getTotalRewardsBalance(
      sixStaker.address
    );
    expect(rewardsBalance).to.be.eq(0);
  });

  it("User 6 stakes 30 AAVE more, with the rewards not enabled", async () => {
    const amount = makeBN18(30);
    const sixStaker = users[5];
    // Keep rewards disabled via config
    const assetsConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    // Checks rewards
    const actions = () => [
      bendToken
        .connect(sixStaker)
        .increaseAllowance(stakedToken.address, amount),
      stakedToken.connect(sixStaker).stake(sixStaker.address, amount),
    ];

    await compareRewardsAtAction(
      stakedToken,
      sixStaker.address,
      actions,
      false,
      assetsConfig
    );

    // Expect rewards balance to still be zero
    const rewardsBalance = await await stakedToken.getTotalRewardsBalance(
      sixStaker.address
    );
    expect(rewardsBalance).to.be.eq(0);
  });

  it("Validates staker cooldown with stake() while being on valid unstake window", async () => {
    const amount1 = makeBN18(50);
    const amount2 = makeBN18(20);
    const staker = users[4];
    await waitForTx(await bendToken.mint(staker.address, makeBN18(100)));
    // Checks rewards
    const actions = () => [
      bendToken
        .connect(staker)
        .increaseAllowance(stakedToken.address, amount1.add(amount2)),
      stakedToken.connect(staker).stake(staker.address, amount1),
    ];

    await compareRewardsAtAction(stakedToken, staker.address, actions, false);

    await stakedToken.connect(staker).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await mineBlockAtTime(
      cooldownActivationTimestamp
        .add(makeBN(COOLDOWN_SECONDS).add(1000))
        .toNumber()
    ); // We fast-forward time to just after the unstake window

    const stakerCooldownTimestampBefore = await stakedToken.stakersCooldowns(
      staker.address
    );
    await waitForTx(
      await stakedToken.connect(staker).stake(staker.address, amount2)
    );
    const latestTimestamp = await timeLatest();
    const expectedCooldownTimestamp = amount2
      .mul(latestTimestamp)
      .add(amount1.mul(stakerCooldownTimestampBefore))
      .div(amount2.add(amount1));
    expect(expectedCooldownTimestamp).to.be.eq(
      await stakedToken.stakersCooldowns(staker.address)
    );
  });
});
