import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import {
  deployDoubleTransferHelper,
  deployStakedToken,
  deployVault,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { fail } from "assert";
import { waitForTx, makeBN18, mineBlock, latestBlockNum } from "../utils";

import {
  buildDelegateByTypeParams,
  buildDelegateParams,
  getSignatureFromTypedData,
} from "../testHelper";

import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from "../constants";

describe("StakedToken delegate tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
  let users: SignerWithAddress[];
  let firstActionBlockNumber = 0;
  let secondActionBlockNumber = 0;
  let keys: { privateKey: string; balance: string }[];
  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    keys = require("../../test-wallets.ts").accounts;
    const vault = await deployVault();
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer.address
    ));
    staker = users[0];
    await waitForTx(await bendToken.mint(staker.address, makeBN18(100)));
  });

  it("User 1 tries to delegate voting power to user 2", async () => {
    const user1 = staker;
    const user2 = users[1];
    await waitForTx(
      await stakedToken.connect(staker).delegateByType(user2.address, "0")
    );

    const delegatee = await stakedToken.getDelegateeByType(user1.address, "0");

    expect(delegatee.toString()).to.be.equal(user2.address);
  });

  it("User 1 tries to delegate proposition power to user 3", async () => {
    const user1 = staker;
    const user3 = users[2];
    await waitForTx(
      await stakedToken.connect(staker).delegateByType(user3.address, "1")
    );

    const delegatee = await stakedToken.getDelegateeByType(user1.address, "1");

    expect(delegatee.toString()).to.be.equal(user3.address);
  });

  it("User1 tries to delegate voting power to ZERO_ADDRESS but delegator should remain", async () => {
    const aaveBalance = makeBN18(1);
    const user = users[5];

    // Stake
    await waitForTx(await bendToken.mint(user.address, aaveBalance));
    await waitForTx(
      await bendToken.connect(user).approve(stakedToken.address, aaveBalance)
    );
    await waitForTx(
      await stakedToken.connect(user).stake(user.address, aaveBalance)
    );

    // Track current power
    const priorPowerUser = await stakedToken.getPowerCurrent(user.address, "0");
    const priorPowerUserZeroAddress = await stakedToken.getPowerCurrent(
      ZERO_ADDRESS,
      "0"
    );

    expect(priorPowerUser).to.be.equal(
      aaveBalance,
      "user power should equal balance"
    );
    expect(priorPowerUserZeroAddress).to.be.equal(
      "0",
      "zero address should have zero power"
    );

    await expect(
      stakedToken.connect(user).delegateByType(ZERO_ADDRESS, "0")
    ).to.be.revertedWith("INVALID_DELEGATEE");
  });

  it("User 1 stakes 2 AAVE; checks voting and proposition power of user 2 and 3", async () => {
    const user1 = staker;
    const user2 = users[1];
    const user3 = users[2];

    const aaveBalance = makeBN18(2);
    const expectedStaked = makeBN18(2);

    // Stake
    await waitForTx(
      await bendToken.connect(user1).approve(stakedToken.address, aaveBalance)
    );
    const tx = await waitForTx(
      await stakedToken.connect(user1).stake(user1.address, aaveBalance)
    );

    const stkAaveBalanceAfterMigration = await stakedToken.balanceOf(
      user1.address
    );

    firstActionBlockNumber = tx.blockNumber;

    const user1PropPower = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );
    const user1VotingPower = await stakedToken.getPowerCurrent(
      user1.address,
      "1"
    );

    const user2VotingPower = await stakedToken.getPowerCurrent(
      user2.address,
      "0"
    );
    const user2PropPower = await stakedToken.getPowerCurrent(
      user2.address,
      "1"
    );

    const user3VotingPower = await stakedToken.getPowerCurrent(
      user3.address,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );

    expect(user1PropPower).to.be.equal("0", "Invalid prop power for user 1");
    expect(user1VotingPower).to.be.equal(
      "0",
      "Invalid voting power for user 1"
    );

    expect(user2PropPower).to.be.equal("0", "Invalid prop power for user 2");
    expect(user2VotingPower).to.be.equal(
      stkAaveBalanceAfterMigration,
      "Invalid voting power for user 2"
    );

    expect(user3PropPower).to.be.equal(
      stkAaveBalanceAfterMigration,
      "Invalid prop power for user 3"
    );
    expect(user3VotingPower).to.be.equal(
      "0",
      "Invalid voting power for user 3"
    );

    expect(expectedStaked).to.be.equal(stkAaveBalanceAfterMigration);
  });

  it("User 2 stakes 2 LEND; checks voting and proposition power of user 2", async () => {
    const user2 = users[1];

    const aaveBalance = makeBN18(2);
    const expectedStkAaveBalanceAfterStake = makeBN18(2);

    // Stake
    await waitForTx(await bendToken.mint(user2.address, aaveBalance));
    await waitForTx(
      await bendToken.connect(user2).approve(stakedToken.address, aaveBalance)
    );
    await waitForTx(
      await stakedToken.connect(user2).stake(user2.address, aaveBalance)
    );

    const user2VotingPower = await stakedToken.getPowerCurrent(
      user2.address,
      "0"
    );
    const user2PropPower = await stakedToken.getPowerCurrent(
      user2.address,
      "1"
    );

    expect(user2PropPower).to.be.equal(
      expectedStkAaveBalanceAfterStake,
      "Invalid prop power for user 2"
    );
    expect(user2VotingPower).to.be.equal(
      expectedStkAaveBalanceAfterStake.mul("2"),
      "Invalid voting power for user 2"
    );
  });

  it("User 3 migrates 2 LEND; checks voting and proposition power of user 3", async () => {
    const user3 = users[2];

    const aaveBalance = makeBN18(2);
    const expectedStkAaveBalanceAfterStake = makeBN18(2);

    // Stake
    await waitForTx(await bendToken.mint(user3.address, aaveBalance));
    await waitForTx(
      await bendToken.connect(user3).approve(stakedToken.address, aaveBalance)
    );
    await waitForTx(
      await stakedToken.connect(user3).stake(user3.address, aaveBalance)
    );

    const user3VotingPower = await stakedToken.getPowerCurrent(
      user3.address,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );

    expect(user3PropPower).to.be.equal(
      expectedStkAaveBalanceAfterStake.mul(2),
      "Invalid prop power for user 3"
    );
    expect(user3VotingPower).to.be.equal(
      expectedStkAaveBalanceAfterStake,
      "Invalid voting power for user 3"
    );
  });

  it("User 2 delegates voting and prop power to user 3", async () => {
    const user2 = users[1];
    const user3 = users[2];

    const expectedDelegatedVotingPower = makeBN18(4);
    const expectedDelegatedPropPower = makeBN18(6);

    await waitForTx(await stakedToken.connect(user2).delegate(user3.address));

    const user3VotingPower = await stakedToken.getPowerCurrent(
      user3.address,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );

    expect(user3VotingPower).to.be.equal(
      expectedDelegatedVotingPower,
      "Invalid voting power for user 3"
    );
    expect(user3PropPower).to.be.equal(
      expectedDelegatedPropPower,
      "Invalid prop power for user 3"
    );
  });

  it("User 1 removes voting and prop power to user 2 and 3", async () => {
    const user1 = staker;
    const user2 = users[1];
    const user3 = users[2];

    await waitForTx(await stakedToken.connect(user1).delegate(user1.address));

    const user2VotingPower = await stakedToken.getPowerCurrent(
      user2.address,
      "0"
    );
    const user2PropPower = await stakedToken.getPowerCurrent(
      user2.address,
      "1"
    );

    const user3VotingPower = await stakedToken.getPowerCurrent(
      user3.address,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );

    const expectedUser2DelegatedVotingPower = 0;
    const expectedUser2DelegatedPropPower = 0;

    const expectedUser3DelegatedVotingPower = makeBN18(4);
    const expectedUser3DelegatedPropPower = makeBN18(4);

    expect(user2VotingPower).to.be.equal(
      expectedUser2DelegatedVotingPower,
      "Invalid voting power for user 3"
    );
    expect(user2PropPower).to.be.equal(
      expectedUser2DelegatedPropPower,
      "Invalid prop power for user 3"
    );

    expect(user3VotingPower).to.be.equal(
      expectedUser3DelegatedVotingPower,
      "Invalid voting power for user 3"
    );
    expect(user3PropPower).to.be.equal(
      expectedUser3DelegatedPropPower,
      "Invalid prop power for user 3"
    );
  });

  it("Checks the delegation at the block of the first action", async () => {
    const user1 = staker;
    const user2 = users[1];
    const user3 = users[2];

    const user1VotingPower = await stakedToken.getPowerAtBlock(
      user1.address,
      firstActionBlockNumber,
      "0"
    );
    const user1PropPower = await stakedToken.getPowerAtBlock(
      user1.address,
      firstActionBlockNumber,
      "1"
    );

    const user2VotingPower = await stakedToken.getPowerAtBlock(
      user2.address,
      firstActionBlockNumber,
      "0"
    );
    const user2PropPower = await stakedToken.getPowerAtBlock(
      user2.address,
      firstActionBlockNumber,
      "1"
    );

    const user3VotingPower = await stakedToken.getPowerAtBlock(
      user3.address,
      firstActionBlockNumber,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerAtBlock(
      user3.address,
      firstActionBlockNumber,
      "1"
    );

    const expectedUser1DelegatedVotingPower = 0;
    const expectedUser1DelegatedPropPower = 0;

    const expectedUser2DelegatedVotingPower = makeBN18(2);
    const expectedUser2DelegatedPropPower = 0;

    const expectedUser3DelegatedVotingPower = 0;
    const expectedUser3DelegatedPropPower = makeBN18(2);

    expect(user1VotingPower).to.be.equal(
      expectedUser1DelegatedPropPower,
      "Invalid voting power for user 1"
    );
    expect(user1PropPower).to.be.equal(
      expectedUser1DelegatedVotingPower,
      "Invalid prop power for user 1"
    );

    expect(user2VotingPower).to.be.equal(
      expectedUser2DelegatedVotingPower,
      "Invalid voting power for user 2"
    );
    expect(user2PropPower).to.be.equal(
      expectedUser2DelegatedPropPower,
      "Invalid prop power for user 2"
    );

    expect(user3VotingPower).to.be.equal(
      expectedUser3DelegatedVotingPower,
      "Invalid voting power for user 3"
    );
    expect(user3PropPower).to.be.equal(
      expectedUser3DelegatedPropPower,
      "Invalid prop power for user 3"
    );
  });

  it("Ensure that getting the power at the current block is the same as using getPowerCurrent", async () => {
    const user1 = staker;

    await mineBlock();

    const currentBlock = await latestBlockNum();

    const votingPowerAtPreviousBlock = await stakedToken.getPowerAtBlock(
      user1.address,
      currentBlock - 1,
      "0"
    );
    const votingPowerCurrent = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );

    const propPowerAtPreviousBlock = await stakedToken.getPowerAtBlock(
      user1.address,
      currentBlock - 1,
      "1"
    );
    const propPowerCurrent = await stakedToken.getPowerCurrent(
      user1.address,
      "1"
    );

    expect(votingPowerAtPreviousBlock).to.be.equal(
      votingPowerCurrent,
      "Invalid voting power for user 1"
    );
    expect(propPowerAtPreviousBlock).to.be.equal(
      propPowerCurrent,
      "Invalid voting power for user 1"
    );
  });

  it("Checks you can't fetch power at a block in the future", async () => {
    const user1 = staker;

    const currentBlock = await latestBlockNum();

    await expect(
      stakedToken.getPowerAtBlock(user1.address, currentBlock + 1, "0")
    ).to.be.revertedWith("INVALID_BLOCK_NUMBER");
    await expect(
      stakedToken.getPowerAtBlock(user1.address, currentBlock + 1, "1")
    ).to.be.revertedWith("INVALID_BLOCK_NUMBER");
  });

  it("User 1 transfers value to himself. Ensures nothing changes in the delegated power", async () => {
    const user1 = staker;

    const user1VotingPowerBefore = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );
    const user1PropPowerBefore = await stakedToken.getPowerCurrent(
      user1.address,
      "1"
    );

    const balance = await stakedToken.balanceOf(user1.address);

    await waitForTx(
      await stakedToken.connect(user1).transfer(user1.address, balance)
    );

    const user1VotingPowerAfter = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );
    const user1PropPowerAfter = await stakedToken.getPowerCurrent(
      user1.address,
      "1"
    );

    expect(user1VotingPowerBefore).to.be.equal(
      user1VotingPowerAfter,
      "Invalid voting power for user 1"
    );
    expect(user1PropPowerBefore).to.be.equal(
      user1PropPowerAfter,
      "Invalid prop power for user 1"
    );
  });
  it("User 1 delegates voting power to User 2 via signature", async () => {
    const user1 = staker;
    const user2 = users[1];

    // Calculate expected voting power
    const user2VotPower = await stakedToken.getPowerCurrent(user2.address, "1");
    const expectedVotingPower = (
      await stakedToken.getPowerCurrent(user1.address, "1")
    ).add(user2VotPower);

    // Check prior delegatee is still user1
    const priorDelegatee = await stakedToken.getDelegateeByType(
      user1.address,
      "0"
    );
    expect(priorDelegatee.toString()).to.be.equal(user1.address);

    // Prepare params to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      stakedToken.address,
      user2.address,
      "0",
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[1].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    const tx = await stakedToken
      .connect(user1)
      .delegateByTypeBySig(user2.address, "0", nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegateChanged")
      .withArgs(user1.address, user2.address, 0);

    // Check DelegatedPowerChanged event: staker power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user1.address, 0, 0);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user2.address, expectedVotingPower, 0);

    // Check internal state
    const delegatee = await stakedToken.getDelegateeByType(user1.address, "0");
    expect(delegatee.toString()).to.be.equal(
      user2.address,
      "Delegatee should be user 2"
    );

    const user2VotingPower = await stakedToken.getPowerCurrent(
      user2.address,
      "0"
    );
    expect(user2VotingPower).to.be.equal(
      expectedVotingPower,
      "Delegatee should have voting power from user 1"
    );
  });

  it("User 1 delegates proposition to User 3 via signature", async () => {
    const user1 = staker;
    const user3 = users[2];

    // Calculate expected proposition power
    const user3PropPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );
    const expectedPropPower = (
      await stakedToken.getPowerCurrent(user1.address, "1")
    ).add(user3PropPower);

    // Check prior proposition delegatee is still user1
    const priorDelegatee = await stakedToken.getDelegateeByType(
      user1.address,
      "1"
    );
    expect(priorDelegatee.toString()).to.be.equal(
      user1.address,
      "expected proposition delegatee to be user1"
    );

    // Prepare parameters to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      stakedToken.address,
      user3.address,
      "1",
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[1].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await stakedToken
      .connect(user1)
      .delegateByTypeBySig(user3.address, "1", nonce, expiration, v, r, s);

    const awaitedTx = await waitForTx(tx);

    // Check tx success and DelegateChanged
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegateChanged")
      .withArgs(user1.address, user3.address, 1);

    // Check DelegatedPowerChanged event: staker power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user1.address, 0, 1);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user3.address, expectedPropPower, 1);

    // Check internal state matches events
    const delegatee = await stakedToken.getDelegateeByType(user1.address, "1");
    expect(delegatee.toString()).to.be.equal(
      user3.address,
      "Delegatee should be user 3"
    );

    const user3PropositionPower = await stakedToken.getPowerCurrent(
      user3.address,
      "1"
    );
    expect(user3PropositionPower).to.be.equal(
      expectedPropPower,
      "Delegatee should have propostion power from user 1"
    );

    // Save current block
    secondActionBlockNumber = awaitedTx.blockNumber;
  });

  it("User 2 delegates all to User 4 via signature", async () => {
    const user1 = staker;
    const user2 = users[1];
    const user4 = users[3];

    await waitForTx(await stakedToken.connect(user2).delegate(user2.address));

    // Calculate expected powers
    const user4PropPower = await stakedToken.getPowerCurrent(
      user4.address,
      "1"
    );
    const expectedPropPower = (
      await stakedToken.getPowerCurrent(user2.address, "1")
    ).add(user4PropPower);

    const user1VotingPower = await stakedToken.balanceOf(user1.address);
    const user4VotPower = await stakedToken.getPowerCurrent(user4.address, "0");
    const user2ExpectedVotPower = user1VotingPower;
    const user4ExpectedVotPower = (
      await stakedToken.getPowerCurrent(user2.address, "0")
    )
      .add(user4VotPower)
      .sub(user1VotingPower); // Delegation does not delegate votes others from other delegations

    // Check prior proposition delegatee is still user1
    const priorPropDelegatee = await stakedToken.getDelegateeByType(
      user2.address,
      "1"
    );
    expect(priorPropDelegatee.toString()).to.be.equal(
      user2.address,
      "expected proposition delegatee to be user1"
    );

    const priorVotDelegatee = await stakedToken.getDelegateeByType(
      user2.address,
      "0"
    );
    expect(priorVotDelegatee.toString()).to.be.equal(
      user2.address,
      "expected proposition delegatee to be user1"
    );

    // Prepare parameters to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      stakedToken.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[2].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await stakedToken
      .connect(user2)
      .delegateBySig(user4.address, nonce, expiration, v, r, s);

    await waitForTx(tx);

    // Check tx success and DelegateChanged for voting
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegateChanged")
      .withArgs(user2.address, user4.address, 1);
    // Check tx success and DelegateChanged for proposition
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegateChanged")
      .withArgs(user2.address, user4.address, 0);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user2.address, 0, 1);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user4.address, expectedPropPower, 1);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user2.address, user2ExpectedVotPower, 0);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(stakedToken, "DelegatedPowerChanged")
      .withArgs(user4.address, user4ExpectedVotPower, 0);

    // Check internal state matches events
    const propDelegatee = await stakedToken.getDelegateeByType(
      user2.address,
      "1"
    );
    expect(propDelegatee.toString()).to.be.equal(
      user4.address,
      "Proposition delegatee should be user 4"
    );

    const votDelegatee = await stakedToken.getDelegateeByType(
      user2.address,
      "0"
    );
    expect(votDelegatee.toString()).to.be.equal(
      user4.address,
      "Voting delegatee should be user 4"
    );

    const user4PropositionPower = await stakedToken.getPowerCurrent(
      user4.address,
      "1"
    );
    expect(user4PropositionPower).to.be.equal(
      expectedPropPower,
      "Delegatee should have propostion power from user 2"
    );
    const user4VotingPower = await stakedToken.getPowerCurrent(
      user4.address,
      "0"
    );
    expect(user4VotingPower).to.be.equal(
      user4ExpectedVotPower,
      "Delegatee should have votinh power from user 2"
    );

    const user2PropositionPower = await stakedToken.getPowerCurrent(
      user2.address,
      "1"
    );
    expect(user2PropositionPower).to.be.equal(
      "0",
      "User 2 should have zero prop power"
    );
    const user2VotingPower = await stakedToken.getPowerCurrent(
      user2.address,
      "0"
    );
    expect(user2VotingPower).to.be.equal(
      user2ExpectedVotPower,
      "User 2 should still have voting power from user 1 delegation"
    );
  });

  it("User 1 should not be able to delegate with bad signature", async () => {
    const user1 = staker;
    const user2 = users[1];

    // Prepare params to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      stakedToken.address,
      user2.address,
      "0",
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[1].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      stakedToken
        .connect(user1)
        .delegateByTypeBySig(user2.address, "0", nonce, expiration, 0, r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("User 1 should not be able to delegate with bad nonce", async () => {
    const user1 = staker;
    const user2 = users[1];

    // Prepare params to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      stakedToken.address,
      user2.address,
      "0",
      MAX_UINT_AMOUNT, // bad nonce
      expiration
    );
    const ownerPrivateKey = keys[1].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      stakedToken
        .connect(user1)
        .delegateByTypeBySig(
          user2.address,
          "0",
          MAX_UINT_AMOUNT,
          expiration,
          v,
          r,
          s
        )
    ).to.be.revertedWith("INVALID_NONCE");
  });

  it("User 1 should not be able to delegate if signature expired", async () => {
    const user1 = staker;
    const user2 = users[1];

    // Prepare params to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user1.address)).toString();
    const expiration = "0";
    const msgParams = buildDelegateByTypeParams(
      chainId,
      stakedToken.address,
      user2.address,
      "0",
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[1].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      stakedToken
        .connect(user1)
        .delegateByTypeBySig(user2.address, "0", nonce, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");
  });

  it("User 2 should not be able to delegate all with bad signature", async () => {
    const user2 = users[1];
    const user4 = users[3];
    // Prepare parameters to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      stakedToken.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[3].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateBySig
    await expect(
      stakedToken
        .connect(user2)
        .delegateBySig(user4.address, nonce, expiration, "0", r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("User 2 should not be able to delegate all with bad nonce", async () => {
    const user2 = users[1];
    const user4 = users[3];
    // Prepare parameters to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = MAX_UINT_AMOUNT;
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      stakedToken.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[3].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      stakedToken
        .connect(user2)
        .delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_NONCE");
  });

  it("User 2 should not be able to delegate all if signature expired", async () => {
    const user2 = users[1];
    const user4 = users[3];
    // Prepare parameters to sign message
    const { chainId } = await ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await stakedToken._nonces(user2.address)).toString();
    const expiration = "0";
    const msgParams = buildDelegateParams(
      chainId,
      stakedToken.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = keys[2].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      stakedToken
        .connect(user2)
        .delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");
  });

  it("Checks the delegation at the block of the second saved action", async () => {
    const user1 = staker;
    const user2 = users[1];
    const user3 = users[2];

    const user1VotingPower = await stakedToken.getPowerAtBlock(
      user1.address,
      secondActionBlockNumber,
      "0"
    );
    const user1PropPower = await stakedToken.getPowerAtBlock(
      user1.address,
      secondActionBlockNumber,
      "1"
    );

    const user2VotingPower = await stakedToken.getPowerAtBlock(
      user2.address,
      secondActionBlockNumber,
      "0"
    );
    const user2PropPower = await stakedToken.getPowerAtBlock(
      user2.address,
      secondActionBlockNumber,
      "1"
    );

    const user3VotingPower = await stakedToken.getPowerAtBlock(
      user3.address,
      secondActionBlockNumber,
      "0"
    );
    const user3PropPower = await stakedToken.getPowerAtBlock(
      user3.address,
      secondActionBlockNumber,
      "1"
    );

    const expectedUser1DelegatedVotingPower = 0;
    const expectedUser1DelegatedPropPower = 0;

    const expectedUser2DelegatedVotingPower = makeBN18(2);
    const expectedUser2DelegatedPropPower = 0;

    const expectedUser3DelegatedVotingPower = makeBN18(4);
    const expectedUser3DelegatedPropPower = makeBN18(6);

    expect(user1VotingPower).to.be.equal(
      expectedUser1DelegatedPropPower,
      "Invalid voting power for user 1"
    );
    expect(user1PropPower).to.be.equal(
      expectedUser1DelegatedVotingPower,
      "Invalid prop power for user 1"
    );

    expect(user2VotingPower).to.be.equal(
      expectedUser2DelegatedVotingPower,
      "Invalid voting power for user 2"
    );
    expect(user2PropPower).to.be.equal(
      expectedUser2DelegatedPropPower,
      "Invalid prop power for user 2"
    );

    expect(user3VotingPower).to.be.equal(
      expectedUser3DelegatedVotingPower,
      "Invalid voting power for user 3"
    );
    expect(user3PropPower).to.be.equal(
      expectedUser3DelegatedPropPower,
      "Invalid prop power for user 3"
    );
  });

  it("Correct proposal and voting snapshotting on double action in the same block", async () => {
    const user1 = staker;
    const receiver = users[1];

    // Reset delegations
    await waitForTx(await stakedToken.connect(user1).delegate(user1.address));
    await waitForTx(
      await stakedToken.connect(receiver).delegate(receiver.address)
    );

    const user1PriorBalance = await stakedToken.balanceOf(user1.address);
    const receiverPriorPower = await stakedToken.getPowerCurrent(
      receiver.address,
      "0"
    );
    const user1PriorPower = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );

    // Deploy double transfer helper
    const doubleTransferHelper = await deployDoubleTransferHelper(
      stakedToken.address
    );

    await waitForTx(
      await stakedToken
        .connect(user1)
        .transfer(doubleTransferHelper.address, user1PriorBalance)
    );

    // Do double transfer
    await waitForTx(
      await doubleTransferHelper
        .connect(user1)
        .doubleSend(
          receiver.address,
          user1PriorBalance.sub(makeBN18(1)),
          makeBN18(1)
        )
    );

    const receiverCurrentPower = await stakedToken.getPowerCurrent(
      receiver.address,
      "0"
    );
    const user1CurrentPower = await stakedToken.getPowerCurrent(
      user1.address,
      "0"
    );

    expect(receiverCurrentPower).to.be.equal(
      user1PriorPower.add(receiverPriorPower),
      "Receiver should have added the user1 power after double transfer"
    );
    expect(user1CurrentPower).to.be.equal(
      0,
      "User1 power should be zero due transfered all the funds"
    );
  });
});
