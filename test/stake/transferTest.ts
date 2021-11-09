import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployStakedToken, deployVault } from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  waitForTx,
  makeBN18,
  timeLatest,
  mineBlockAndIncreaseTime,
  increaseTime,
} from "../utils";

import {
  compareRewardsAtAction,
  compareRewardsAtTransfer,
} from "../testHelper";

import { COOLDOWN_SECONDS, UNSTAKE_WINDOW } from "../constants";

describe("StakedBend transfer tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    const vault = await deployVault();
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer.address
    ));
    staker = users[0];
    await waitForTx(await bendToken.mint(staker.address, makeBN18(100)));
  });
  it("User 1 stakes 50 BEND", async () => {
    const amount = makeBN18(50);

    const actions = () => [
      bendToken.connect(staker).approve(stakedToken.address, amount),
      stakedToken.connect(staker).stake(staker.address, amount),
    ];

    await compareRewardsAtAction(stakedToken, staker.address, actions);
  });

  it("User 1 transfers 50 stkBEND to User 5", async () => {
    const amount = makeBN18(50);
    const receiver = users[4];
    const sender = staker;

    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      true,
      false
    );
  });

  it("User 5 transfers 50 stkBEND to himself", async () => {
    const amount = makeBN18(50);
    const sender = users[4];
    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      sender,
      amount,
      true,
      true
    );
  });

  it("User 5 transfers 50 stkBEND to user 2, with rewards not enabled", async () => {
    const amount = makeBN18(50);
    const sender = users[4];
    const receiver = users[1];

    // Configuration to disable emission
    const assetConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      false,
      false,
      assetConfig
    );
  });

  it("User 4 stakes and transfers 50 stkBEND to user 2, with rewards not enabled", async () => {
    const amount = makeBN18(50);
    const sender = users[3];
    const receiver = users[1];

    // Configuration to disable emission
    const assetConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    const actions = () => [
      bendToken.mint(sender.address, amount),
      bendToken.connect(sender).approve(stakedToken.address, amount),
      stakedToken.connect(sender).stake(sender.address, amount),
    ];

    await compareRewardsAtAction(
      stakedToken,
      sender.address,
      actions,
      false,
      assetConfig
    );
    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      false,
      false,
      assetConfig
    );
  });
  it("Activate cooldown of User 2, transfer entire amount from User 2 to User 3, cooldown of User 2 should be reset", async () => {
    const sender = users[1];
    const receiver = users[2];

    const amount = await stakedToken.balanceOf(sender.address);

    // Configuration to disable emission
    const assetConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    await stakedToken.connect(sender).cooldown();
    const cooldownActivationTimestamp = await timeLatest();

    const cooldownTimestamp = await stakedToken.stakersCooldowns(
      sender.address
    );
    expect(cooldownTimestamp).to.be.gt(0);
    expect(cooldownTimestamp).to.eq(cooldownActivationTimestamp);

    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      false,
      false,
      assetConfig
    );

    // Expect cooldown time to reset after sending the entire balance of sender
    const cooldownTimestampAfterTransfer = await stakedToken.stakersCooldowns(
      sender.address
    );
    expect(cooldownTimestampAfterTransfer).to.eq(0);
  });

  it("Transfer balance from User 3 to user 2, cooldown  of User 2 should be reset if User3 cooldown expired", async () => {
    const amount = makeBN18(10);
    const sender = users[2];
    const receiver = users[1];

    // Configuration to disable emission
    const assetConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    // First enable cooldown for sender
    await stakedToken.connect(sender).cooldown();

    // Then enable cooldown for receiver
    await bendToken.mint(receiver.address, amount);
    await bendToken.connect(receiver).approve(stakedToken.address, amount);
    await stakedToken.connect(receiver).stake(receiver.address, amount);
    await stakedToken.connect(receiver).cooldown();
    const receiverCooldown = await stakedToken.stakersCooldowns(sender.address);

    // Increase time to an invalid time for cooldown
    await mineBlockAndIncreaseTime(
      receiverCooldown
        .add(COOLDOWN_SECONDS)
        .add(UNSTAKE_WINDOW)
        .add(1)
        .toNumber()
    );
    // Transfer staked BEND from sender to receiver, it will also transfer the cooldown status from sender to the receiver
    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      false,
      false,
      assetConfig
    );

    // Receiver cooldown should be set to zero
    const stakerCooldownTimestampBefore = await stakedToken.stakersCooldowns(
      receiver.address
    );
    expect(stakerCooldownTimestampBefore).to.be.eq(0);
  });

  it("Transfer balance from User 3 to user 2, cooldown of User 2 should be the same if User3 cooldown is less than User2 cooldown", async () => {
    const amount = makeBN18(10);
    const sender = users[2];
    const receiver = users[1];

    // Configuration to disable emission
    const assetConfig = {
      emissionPerSecond: "0",
      totalStaked: "0",
    };

    // Enable cooldown for sender
    await stakedToken.connect(sender).cooldown();
    await increaseTime(5);

    // Enable enable cooldown for receiver
    await stakedToken.connect(receiver).cooldown();
    const receiverCooldown = await stakedToken.stakersCooldowns(
      receiver.address
    );

    // Transfer staked BEND from sender to receiver, it will also transfer the cooldown status from sender to the receiver
    await compareRewardsAtTransfer(
      stakedToken,
      sender,
      receiver,
      amount,
      false,
      false,
      assetConfig
    );

    // Receiver cooldown should be like before
    const receiverCooldownAfterTransfer = await stakedToken.stakersCooldowns(
      receiver.address
    );
    expect(receiverCooldownAfterTransfer).to.be.eq(receiverCooldown);
  });
});
