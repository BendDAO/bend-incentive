import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployStakedToken } from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  waitForTx,
  fastForwardTimeAndBlock,
  fastForwardBlock,
  makeBN18,
  timeLatest,
} from "../utils";

import { COOLDOWN_SECONDS, UNSTAKE_WINDOW } from "../constants";

describe("StakedToken redeem tests", function () {
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
  });
  it("Reverts trying to redeem 0 amount", async () => {
    const amount = 0;

    await expect(
      stakedToken.connect(staker).redeem(staker.address, amount)
    ).to.be.revertedWith("INVALID_ZERO_AMOUNT");
  });

  it("User 1 stakes 50 AAVE", async () => {
    const amount = makeBN18(50);

    await waitForTx(
      await bendToken.connect(staker).approve(stakedToken.address, amount)
    );
    await waitForTx(
      await stakedToken.connect(staker).stake(staker.address, amount)
    );
  });

  it("User 1 tries to redeem without activating the cooldown first", async () => {
    const amount = makeBN18(50);

    await expect(
      stakedToken.connect(staker).redeem(staker.address, amount)
    ).to.be.revertedWith("UNSTAKE_WINDOW_FINISHED");
  });

  it("User 1 activates the cooldown, but is not able to redeem before the COOLDOWN_SECONDS passed", async () => {
    const amount = makeBN18(50);

    await stakedToken.connect(staker).cooldown();

    const startedCooldownAt = await await stakedToken.stakersCooldowns(
      staker.address
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt
      .add(COOLDOWN_SECONDS)
      .sub(currentTime);
    await fastForwardTimeAndBlock(Number(remainingCooldown.div(2)));
    await expect(
      stakedToken.connect(staker).redeem(staker.address, amount)
    ).to.be.revertedWith("INSUFFICIENT_COOLDOWN");

    await fastForwardBlock(
      startedCooldownAt.add(COOLDOWN_SECONDS - 1).toNumber()
    ); // We fast-forward time to just before COOLDOWN_SECONDS

    await expect(
      stakedToken.connect(staker).redeem(staker.address, amount)
    ).to.be.revertedWith("INSUFFICIENT_COOLDOWN");

    await fastForwardBlock(
      startedCooldownAt.add(COOLDOWN_SECONDS + UNSTAKE_WINDOW + 1).toNumber()
    ); // We fast-forward time to just after the unstake window

    await expect(
      stakedToken.connect(staker).redeem(staker.address, amount)
    ).to.be.revertedWith("UNSTAKE_WINDOW_FINISHED");
  });

  it("User 1 activates the cooldown again, and tries to redeem a bigger amount that he has staked, receiving the balance", async () => {
    const amount = makeBN18(1000);

    await stakedToken.connect(staker).cooldown();
    const startedCooldownAt = await await stakedToken.stakersCooldowns(
      staker.address
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt
      .add(COOLDOWN_SECONDS)
      .sub(currentTime);

    await fastForwardTimeAndBlock(remainingCooldown.add(1).toNumber());
    const aaveBalanceBefore = await bendToken.balanceOf(staker.address);
    const stakedAaveBalanceBefore = await stakedToken.balanceOf(staker.address);
    await stakedToken.connect(staker).redeem(staker.address, amount);
    const aaveBalanceAfter = await bendToken.balanceOf(staker.address);
    const stakedAaveBalanceAfter = await stakedToken.balanceOf(staker.address);
    expect(aaveBalanceAfter.sub(stakedAaveBalanceBefore)).to.be.eq(
      aaveBalanceBefore
    );
    expect(stakedAaveBalanceAfter).to.be.eq(0);
  });

  it("User 1 activates the cooldown again, and redeems within the unstake period", async () => {
    const amount = makeBN18(50);

    await waitForTx(
      await bendToken.connect(staker).approve(stakedToken.address, amount)
    );
    await waitForTx(
      await stakedToken.connect(staker).stake(staker.address, amount)
    );

    await stakedToken.connect(staker).cooldown();
    const startedCooldownAt = await await stakedToken.stakersCooldowns(
      staker.address
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt
      .add(COOLDOWN_SECONDS)
      .sub(currentTime);

    await fastForwardTimeAndBlock(remainingCooldown.add(1).toNumber());
    const aaveBalanceBefore = await bendToken.balanceOf(staker.address);
    await stakedToken.connect(staker).redeem(staker.address, amount);
    const aaveBalanceAfter = await bendToken.balanceOf(staker.address);
    expect(aaveBalanceAfter.sub(amount)).to.be.eq(aaveBalanceBefore);
  });

  it("User 4 stakes 50 AAVE, activates the cooldown and redeems half of the amount", async () => {
    const amount = makeBN18(50);

    await waitForTx(
      await bendToken.connect(staker).approve(stakedToken.address, amount)
    );
    await waitForTx(
      await stakedToken.connect(staker).stake(staker.address, amount)
    );

    await stakedToken.connect(staker).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await fastForwardBlock(
      cooldownActivationTimestamp.add(COOLDOWN_SECONDS + 1).toNumber()
    );

    const aaveBalanceBefore = await bendToken.balanceOf(staker.address);
    await stakedToken
      .connect(staker)
      .redeem(staker.address, makeBN18(50).div(2));
    const aaveBalanceAfter = await bendToken.balanceOf(staker.address);
    expect(aaveBalanceAfter.sub(amount)).to.be.eq(aaveBalanceBefore.div(2));
  });

  it("User 5 stakes 50 AAVE, activates the cooldown and redeems with rewards not enabled", async () => {
    const amount = makeBN18(50);

    await waitForTx(
      await bendToken.connect(staker).approve(stakedToken.address, amount)
    );
    await waitForTx(
      await stakedToken.connect(staker).stake(staker.address, amount)
    );

    await stakedToken.connect(staker).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await fastForwardBlock(
      cooldownActivationTimestamp.add(COOLDOWN_SECONDS + 1).toNumber()
    );

    const aaveBalanceBefore = await bendToken.balanceOf(staker.address);
    await stakedToken.connect(staker).redeem(staker.address, amount);
    const aaveBalanceAfter = await bendToken.balanceOf(staker.address);
    expect(aaveBalanceAfter.sub(amount)).to.be.eq(aaveBalanceBefore);
  });
});
