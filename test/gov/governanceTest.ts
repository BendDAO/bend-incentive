import { expect } from "chai";
import { ipfsBytes32Hash, MAX_UINT_AMOUNT, ZERO_ADDRESS } from "../constants";
import {
  deployGovernance,
  deployFlashAttacks,
  GovContracts,
  deployGovernanceStrategy,
  deployExecutor,
} from "../deployHelper";
import { BytesLike } from "ethers/lib/utils";
import { BigNumberish, BigNumber, Signer, Contract } from "ethers";
import {
  evmRevert,
  evmSnapshot,
  waitForTx,
  mineBlockToHeight,
  mineBlockAtTime,
  mineBlock,
  latestBlockNum,
} from "../utils";
import {
  emptyBalances,
  getInitContractData,
  setBalance,
  expectProposalState,
  encodeSetDelay,
  impersonateAccountsHardhat,
} from "./gov-utils";
import { buildGovPermitParams, getSignatureFromTypedData } from "../testHelper";
import { fail } from "assert";
import hre from "hardhat";

const proposalStates = {
  PENDING: 0,
  CANCELED: 1,
  ACTIVE: 2,
  FAILED: 3,
  SUCCEEDED: 4,
  QUEUED: 5,
  EXPIRED: 6,
  EXECUTED: 7,
};

const snapshots = new Map<string, string>();

describe("Governance tests", function () {
  let govContracts: GovContracts;
  let votingDelay: BigNumber;
  let votingDuration: BigNumber;
  let executionDelay: BigNumber;
  let minimumPower: BigNumber;
  let minimumCreatePower: BigNumber;
  let proposal1Id: BigNumber;
  let proposal2Id: BigNumber;
  let proposal3Id: BigNumber;
  let proposal4Id: BigNumber;
  let startBlock: BigNumber;
  let endBlock: BigNumber;
  let executionTime: BigNumber;
  let gracePeriod: BigNumber;
  let flashAttacks: Contract;
  let executorSigner: Signer;
  let govSigner: Signer;

  // Snapshoting main states as entry for later testing
  // Then will test by last snap shot first.
  before(async () => {
    govContracts = await deployGovernance();
    const {
      governance,
      executor,
      governanceStrategy,
      bendToken,
      users,
      vault,
    } = govContracts;
    const [user1, user2, user3, user4, user5, user6] = users;

    ({
      votingDelay,
      votingDuration,
      executionDelay,
      minimumPower,
      minimumCreatePower,
      gracePeriod,
    } = await getInitContractData(govContracts));

    // Impersonate executor
    await impersonateAccountsHardhat([executor.address, governance.address]);

    executorSigner = hre.ethers.provider.getSigner(executor.address);
    govSigner = hre.ethers.provider.getSigner(governance.address);
    // Deploy flash attacks contract and approve from vault address
    flashAttacks = await deployFlashAttacks(
      bendToken.address,
      vault.address,
      governance.address
    );
    await vault.approve(
      bendToken.address,
      flashAttacks.address,
      MAX_UINT_AMOUNT
    );

    // Cleaning users balances
    await emptyBalances(users, govContracts);

    // SNAPSHOT: EMPTY GOVERNANCE
    snapshots.set("start", await evmSnapshot());

    // Giving user 1 enough power to propose
    await setBalance(user1, minimumPower, govContracts);

    const callData = await encodeSetDelay(400, govContracts);

    //Creating first proposal: Changing delay to 300 via no sig + calldata
    const tx1 = await waitForTx(
      await governance
        .connect(user1)
        .create(
          executor.address,
          [governance.address],
          ["0"],
          [""],
          [callData],
          [false],
          ipfsBytes32Hash
        )
    );
    //Creating 2nd proposal: Changing delay to 300 via sig + argument data
    const encodedArgument2 = hre.ethers.utils.defaultAbiCoder.encode(
      ["uint"],
      [300]
    );
    const tx2 = await waitForTx(
      await governance
        .connect(user1)
        .create(
          executor.address,
          [governance.address],
          ["0"],
          ["setVotingDelay(uint256)"],
          [encodedArgument2],
          [false],
          ipfsBytes32Hash
        )
    );

    const encodedArgument3 = hre.ethers.utils.defaultAbiCoder.encode(
      ["address"],
      [user1.address]
    );
    const tx3 = await waitForTx(
      await governance
        .connect(user1)
        .create(
          executor.address,
          [executor.address],
          ["0"],
          ["setPendingAdmin(address)"],
          [encodedArgument3],
          [false],
          ipfsBytes32Hash
        )
    );
    // cleaning up user1 balance
    await emptyBalances([user1], govContracts);

    // fixing constants
    proposal1Id = tx1.events?.[0].args?.id;
    proposal2Id = tx2.events?.[0].args?.id;
    proposal3Id = tx3.events?.[0].args?.id;
    startBlock = BigNumber.from(tx2.blockNumber).add(votingDelay);
    endBlock = BigNumber.from(tx2.blockNumber)
      .add(votingDelay)
      .add(votingDuration);
    await expectProposalState(
      proposal2Id,
      proposalStates.PENDING,
      govContracts
    );

    // SNAPSHOT: PENDING PROPOSAL
    snapshots.set("pending", await evmSnapshot());

    // Preparing users with different powers for test
    // user 1: 50% min voting power + 2 = 10%+ total power
    await setBalance(user1, minimumPower.div("2").add("2"), govContracts);
    // user 2: 50% min voting power + 2 = 10%+ total power
    await setBalance(user2, minimumPower.div("2").add("2"), govContracts);
    // user 3: 2 % min voting power, will be used to swing the vote
    await setBalance(
      user3,
      minimumPower.mul("2").div("100").add("10"),
      govContracts
    );
    // user 4: 75% min voting power + 10 : = 15%+ total power, can barely make fail differential
    await setBalance(
      user4,
      minimumPower.mul("75").div("100").add("10"),
      govContracts
    );
    // user 5: 50% min voting power + 2 = 10%+ total power.
    await setBalance(user5, minimumPower.div("2").add("2"), govContracts);
    let block = await hre.ethers.provider.getBlockNumber();
    expect(
      await governanceStrategy.getVotingPowerAt(user5.address, block)
    ).to.be.equal(minimumPower.div("2").add("2"));
    // user 5 delegates to user 2 => user 2 reached quorum
    await waitForTx(await bendToken.connect(user5).delegate(user2.address));
    block = await hre.ethers.provider.getBlockNumber();
    // checking delegation worked
    expect(
      await governanceStrategy.getVotingPowerAt(user5.address, block)
    ).to.be.equal("0");
    expect(
      await governanceStrategy.getVotingPowerAt(user2.address, block)
    ).to.be.equal(minimumPower.div("2").add("2").mul(2));
    await expectProposalState(
      proposal3Id,
      proposalStates.PENDING,
      govContracts
    );
    await expectProposalState(
      proposal2Id,
      proposalStates.PENDING,
      govContracts
    );
    await expectProposalState(
      proposal1Id,
      proposalStates.PENDING,
      govContracts
    );
    const balanceAfter = await bendToken
      .connect(user1)
      .balanceOf(user1.address);
    // Pending => Active
    // => go tto start block
    await mineBlockToHeight(Number(startBlock.add(2).toString()));
    await expectProposalState(proposal3Id, proposalStates.ACTIVE, govContracts);
    await expectProposalState(proposal2Id, proposalStates.ACTIVE, govContracts);
    await expectProposalState(proposal1Id, proposalStates.ACTIVE, govContracts);

    // SNAPSHOT: ACTIVE PROPOSAL
    snapshots.set("active", await evmSnapshot());

    // Active => Succeeded, user 2 votes + delegated from 5 > threshold
    await expect(governance.connect(user2).submitVote(proposal2Id, true))
      .to.emit(governance, "VoteEmitted")
      .withArgs(proposal2Id, user2.address, true, balanceAfter.mul("2"));
    await expect(governance.connect(user2).submitVote(proposal1Id, true))
      .to.emit(governance, "VoteEmitted")
      .withArgs(proposal1Id, user2.address, true, balanceAfter.mul("2"));
    await expect(governance.connect(user2).submitVote(proposal3Id, true))
      .to.emit(governance, "VoteEmitted")
      .withArgs(proposal3Id, user2.address, true, balanceAfter.mul("2"));
    // go to end of voting period
    await mineBlockToHeight(Number(endBlock.add("3").toString()));
    await expectProposalState(
      proposal3Id,
      proposalStates.SUCCEEDED,
      govContracts
    );
    await expectProposalState(
      proposal2Id,
      proposalStates.SUCCEEDED,
      govContracts
    );
    await expectProposalState(
      proposal1Id,
      proposalStates.SUCCEEDED,
      govContracts
    );

    // SNAPSHOT: SUCCEEDED PROPOSAL
    snapshots.set("succeeded", await evmSnapshot());

    // Succeeded => Queued:
    await (await governance.connect(user1).queue(proposal1Id)).wait();
    await (await governance.connect(user1).queue(proposal2Id)).wait();
    await (await governance.connect(user1).queue(proposal3Id)).wait();
    await expectProposalState(proposal1Id, proposalStates.QUEUED, govContracts);
    await expectProposalState(proposal2Id, proposalStates.QUEUED, govContracts);
    await expectProposalState(proposal3Id, proposalStates.QUEUED, govContracts);
    // SNAPSHOT: QUEUED PROPOSAL
    executionTime = (await governance.getProposalById(proposal2Id))
      .executionTime;
    snapshots.set("queued", await evmSnapshot());
  });
  describe("Testing cancel function on queued proposal on governance + exec", function () {
    beforeEach(async () => {
      // Revert to queued state
      await evmRevert(snapshots.get("queued") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      // EVM Snapshots are consumed, need to snapshot again for next test
      snapshots.set("queued", await evmSnapshot());
    });
    it("should not cancel when Threshold is higher than minimum and not guardian", async () => {
      const {
        governance,
        users: [user],
        vault,
      } = govContracts;
      // giving threshold power
      await setBalance(user, minimumCreatePower, govContracts);
      // not guardian, no threshold
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("PROPOSITION_CANCELLATION_INVALID");
    });
    it("should cancel a queued proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        executor,
        users: [user],
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");

      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should not cancel when proposition already canceled", async () => {
      const {
        governance,
        guardian,
        executor,
        users: [user],
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
      await expect(
        governance.connect(guardian).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
    });
    it("should cancel queued prop by guardian, when creator still above threshold", async () => {
      const {
        governance,
        guardian,
        executor,
        users: [user],
      } = govContracts;
      // creator still above threshold power
      await setBalance(user, minimumCreatePower, govContracts);
      // cancel as guardian
      await expect(governance.connect(guardian).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
  });
  describe("Testing execute function", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("queued") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      snapshots.set("queued", await evmSnapshot());
    });
    it("should not execute a canceled prop", async () => {
      const {
        governance,
        deployer,
        guardian,
        executor,
        users: [user],
      } = govContracts;
      await expect(governance.connect(guardian).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
      await mineBlockAtTime(Number(executionTime.toString()));

      // Execute the propoal
      const executeTx = governance.connect(user).execute(proposal2Id);

      await expect(Promise.resolve(executeTx)).to.be.revertedWith(
        "ONLY_QUEUED_PROPOSALS"
      );
    });
    it("should not execute a queued prop before timelock", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;

      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      // 5 sec before delay reached
      await mineBlockAtTime(Number(executionTime.sub(5).toString()));

      // Execute the propoal
      const executeTx = governance.connect(user).execute(proposal2Id);

      await expect(Promise.resolve(executeTx)).to.be.revertedWith(
        "TIMELOCK_NOT_FINISHED"
      );
    });
    it("should not execute a queued prop after grace period (expired)", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;

      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
      // 5 sec before delay reached
      await mineBlockAtTime(
        Number(executionTime.add(gracePeriod).add(5).toString())
      );

      // Execute the propoal
      const executeTx = governance.connect(user).execute(proposal2Id);

      await expect(Promise.resolve(executeTx)).to.be.revertedWith(
        "ONLY_QUEUED_PROPOSALS"
      );
      await expectProposalState(
        proposal2Id,
        proposalStates.EXPIRED,
        govContracts
      );
    });
    it("should execute one proposal with no sig + calldata", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      await mineBlockAtTime(
        Number(executionTime.add(gracePeriod).sub(5).toString())
      );

      expect(await governance.getVotingDelay()).to.be.equal(votingDelay);
      // Execute the proposal: changing the delay to 300
      const executeTx = governance.connect(user).execute(proposal2Id);

      await expect(Promise.resolve(executeTx))
        .to.emit(governance, "ProposalExecuted")
        .withArgs(proposal2Id, user.address);
      expect(await governance.getVotingDelay()).to.be.equal(
        BigNumber.from("300")
      );
      const proposalState = await governance.getProposalState(proposal2Id);
      expect(proposalState).to.equal(proposalStates.EXECUTED);
    });
    it("should execute one proposal with sig + argument", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      await mineBlockAtTime(
        Number(executionTime.add(gracePeriod).sub(5).toString())
      );

      expect(await governance.getVotingDelay()).to.be.equal(votingDelay);

      // execute the second proposal: changing delay to 400
      const executeTx1 = governance.connect(user).execute(proposal1Id);

      await expect(Promise.resolve(executeTx1))
        .to.emit(governance, "ProposalExecuted")
        .withArgs(proposal1Id, user.address);
      expect(await governance.getVotingDelay()).to.be.equal(
        BigNumber.from("400")
      );
    });
    it("should change admin via proposal", async () => {
      const {
        governance,
        executor,
        users: [user],
      } = govContracts;
      await mineBlockAtTime(
        Number(executionTime.add(gracePeriod).sub(5).toString())
      );

      expect(await executor.getPendingAdmin()).to.be.equal(ZERO_ADDRESS);

      // execute the second proposal: changing delay to 400
      const executeTx3 = governance.connect(user).execute(proposal3Id);

      await expect(Promise.resolve(executeTx3))
        .to.emit(governance, "ProposalExecuted")
        .withArgs(proposal3Id, user.address);
      expect(await executor.getPendingAdmin()).to.be.equal(user.address);
      expect(await executor.getAdmin()).to.be.equal(governance.address);

      await (await executor.connect(user).acceptAdmin()).wait();
      expect(await executor.getAdmin()).to.be.equal(user.address);
    });
  });
  describe("Testing cancel function on succeeded proposal", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("succeeded") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
      snapshots.set("succeeded", await evmSnapshot());
    });
    it("should not cancel when Threshold is higher than minimum and not guardian", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // giving threshold power
      await setBalance(user, minimumCreatePower, govContracts);
      // not guardian, no threshold
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("PROPOSITION_CANCELLATION_INVALID");
    });
    it("should cancel a succeeded proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should not cancel when proposition already canceled", async () => {
      const {
        governance,
        executor,
        guardian,
        users: [user],
      } = govContracts;
      // removing threshold power
      // cancelled
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
      await expect(
        governance.connect(guardian).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
    });
    it("should cancel succeeded prop by guardian, when creator still above threshold", async () => {
      const {
        governance,
        guardian,
        users: [user],
        executor,
      } = govContracts;
      // giving threshold power to creator
      await setBalance(user, minimumCreatePower, govContracts);
      // cancel as guardian
      await expect(governance.connect(guardian).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should cancel an succeeded proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        executor,
        users: [user],
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);

      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
  });
  describe("Testing queue function", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("succeeded") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
      snapshots.set("succeeded", await evmSnapshot());
    });
    it("Queue a proposal", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // Queue
      const queueTx = await governance.connect(user).queue(proposal2Id);
      const queueTxResponse = await waitForTx(queueTx);
      const blockTime = await hre.ethers.provider.getBlock(
        queueTxResponse.blockNumber
      );

      const executionTime =
        blockTime.timestamp + Number(executionDelay.toString());

      await expect(Promise.resolve(queueTx))
        .to.emit(governance, "ProposalQueued")
        .withArgs(proposal2Id, executionTime, user.address);
      await expectProposalState(
        proposal2Id,
        proposalStates.QUEUED,
        govContracts
      );
    });
  });
  describe("Testing queue  revert", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("active") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      snapshots.set("active", await evmSnapshot());
    });
    it("Queue an ACTIVE proposal should revert", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      await expect(
        governance.connect(user).queue(proposal2Id)
      ).to.be.revertedWith("INVALID_STATE_FOR_QUEUE");
    });
  });
  describe("Testing getProposalState revert", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("active") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      snapshots.set("active", await evmSnapshot());
    });
    it("Try to queue an non existing proposal should revert with INVALID_PROPOSAL_ID", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      await expect(governance.connect(user).queue("100")).to.be.revertedWith(
        "INVALID_PROPOSAL_ID"
      );
    });
  });
  describe("Testing voting functions", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("active") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      snapshots.set("active", await evmSnapshot());
    });
    it("Vote a proposal without quorum => proposal failed", async () => {
      // User 1 has 50% min power, should fail
      const {
        governance,
        executor,
        users: [user1],
        bendToken,
      } = govContracts;

      // user 1 has only half of enough voting power
      const balance = await bendToken.connect(user1).balanceOf(user1.address);
      await expect(governance.connect(user1).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user1.address, true, balance);

      await mineBlockToHeight(Number(endBlock.add("9").toString()));
      expect(
        await executor.isQuorumValid(governance.address, proposal2Id)
      ).to.be.equal(false);
      expect(
        await executor.isVoteDifferentialValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await governance.connect(user1).getProposalState(proposal2Id)
      ).to.be.equal(proposalStates.FAILED);
    });
    it("Vote a proposal with quorum => proposal succeeded", async () => {
      // Vote
      const {
        governance,
        executor,
        governanceStrategy,
        users: [user1, user2],
        bendToken,
      } = govContracts;
      // User 1 + User 2 power > voting po<wer, see before() function
      const balance1 = await bendToken.connect(user1).balanceOf(user1.address);
      await expect(governance.connect(user1).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user1.address, true, balance1);
      //  user 2 has received delegation from user 5
      const power2 = await governanceStrategy.getVotingPowerAt(
        user2.address,
        startBlock
      );
      await expect(governance.connect(user2).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user2.address, true, power2);

      // active => succeeded

      await mineBlockToHeight(Number(endBlock.add("10").toString()));
      expect(
        await executor.isQuorumValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await executor.isVoteDifferentialValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await governance.connect(user1).getProposalState(proposal2Id)
      ).to.be.equal(proposalStates.SUCCEEDED);
    });
    it("Vote a proposal with quorum via delegation => proposal succeeded", async () => {
      // Vote
      const {
        governance,
        governanceStrategy,
        executor,
        users: [user1, user2, , , user5],
        bendToken,
      } = govContracts;
      // user 5 has delegated to user 2
      const balance2 = await bendToken.connect(user1).balanceOf(user2.address);
      const balance5 = await bendToken.connect(user2).balanceOf(user5.address);
      expect(
        await governanceStrategy.getVotingPowerAt(user2.address, startBlock)
      ).to.be.equal(balance2.add(balance5));
      await expect(governance.connect(user2).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user2.address, true, balance2.add(balance5));
      // active => succeeded
      await mineBlockToHeight(Number(endBlock.add("11").toString()));
      expect(
        await executor.isQuorumValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await executor.isVoteDifferentialValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await governance.connect(user1).getProposalState(proposal2Id)
      ).to.be.equal(proposalStates.SUCCEEDED);
    });
    it("Vote a proposal with quorum but not vote dif => proposal failed", async () => {
      // Vote
      const {
        governance,
        governanceStrategy,
        users: [user1, user2, user3, user4],
        vault,
        executor,
        bendToken,
      } = govContracts;
      // User 2 + User 5 delegation = 20% power, voting yes
      //  user 2 has received delegation from user 5
      const power2 = await governanceStrategy.getVotingPowerAt(
        user2.address,
        startBlock
      );
      await expect(governance.connect(user2).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user2.address, true, power2);

      // User 4 = 15% Power, voting no
      const balance4 = await bendToken.connect(user4).balanceOf(user4.address);
      await expect(governance.connect(user4).submitVote(proposal2Id, false))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user4.address, false, balance4);

      await mineBlockToHeight(Number(endBlock.add("12").toString()));
      expect(
        await executor.isQuorumValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await executor.isVoteDifferentialValid(governance.address, proposal2Id)
      ).to.be.equal(false);
      expect(
        await governance.connect(user1).getProposalState(proposal2Id)
      ).to.be.equal(proposalStates.FAILED);
    });
    it("Vote a proposal with quorum and vote dif => proposal succeeded", async () => {
      // Vote
      const {
        governance,
        governanceStrategy,
        users: [user1, user2, user3, user4],
        vault,
        executor,
        bendToken,
      } = govContracts;
      // User 2 + User 5 delegation = 20% power, voting yes
      //  user 2 has received delegation from user 5
      const power2 = await governanceStrategy.getVotingPowerAt(
        user2.address,
        startBlock
      );
      await expect(governance.connect(user2).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user2.address, true, power2);

      // User 4 = 15% Power, voting no
      const balance4 = await bendToken.connect(user4).balanceOf(user4.address);
      await expect(governance.connect(user4).submitVote(proposal2Id, false))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user4.address, false, balance4);

      // User 3 makes the vote swing
      const balance3 = await bendToken.connect(user3).balanceOf(user3.address);
      await expect(governance.connect(user3).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user3.address, true, balance3);

      await mineBlockToHeight(Number(endBlock.add("13").toString()));
      expect(
        await executor.isQuorumValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await executor.isVoteDifferentialValid(governance.address, proposal2Id)
      ).to.be.equal(true);
      expect(
        await governance.connect(user1).getProposalState(proposal2Id)
      ).to.be.equal(proposalStates.SUCCEEDED);
    });

    it("Vote a proposal by permit", async () => {
      const {
        users: [, , user3],
        vault,
        bendToken,
        governance,
      } = govContracts;
      const { chainId } = await hre.ethers.provider.getNetwork();
      const configChainId = hre.network.config.chainId;
      // ChainID must exist in current provider to work
      expect(configChainId).to.be.equal(chainId);
      if (!chainId) {
        fail("Current network doesn't have CHAIN ID");
      }

      // Prepare signature
      const msgParams = buildGovPermitParams(
        chainId,
        governance.address,
        proposal2Id.toString(),
        true
      );
      const ownerPrivateKey = require("../../test-wallets.ts").accounts[4]
        .privateKey; // deployer, vault, user1, user2, user3

      const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      const balance = await bendToken
        .connect(vault.address)
        .balanceOf(user3.address);

      // Publish vote by signature using other address as relayer
      const votePermitTx = await governance
        .connect(user3)
        .submitVoteBySignature(proposal2Id, true, v, r, s);

      await expect(Promise.resolve(votePermitTx))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user3.address, true, balance);

      const { votingPower } = await governance.getVoteOnProposal(
        proposal2Id,
        user3.address
      );
      expect(votingPower).to.be.eq(balance);
    });
    it("Revert permit vote if invalid signature", async () => {
      const {
        users: [, , user3],
        vault,
        bendToken,
        governance,
      } = govContracts;
      const { chainId } = await hre.ethers.provider.getNetwork();
      const configChainId = hre.network.config.chainId;
      // ChainID must exist in current provider to work
      expect(configChainId).to.be.equal(chainId);
      if (!chainId) {
        fail("Current network doesn't have CHAIN ID");
      }

      // Prepare signature
      const msgParams = buildGovPermitParams(
        chainId,
        governance.address,
        proposal2Id.toString(),
        true
      );
      const ownerPrivateKey = require("../../test-wallets.ts").accounts[4]
        .privateKey; // deployer, vault, user1, user2, user3

      const { r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      // Publish vote by signature using other address as relayer
      expect(
        governance
          .connect(user3)
          .submitVoteBySignature(proposal2Id, true, "17", r, s)
      ).to.revertedWith("INVALID_SIGNATURE");
    });
    it("Should not allow Flash vote: the voting power should be zero", async () => {
      const {
        governance,
        users: [, , , , , user6],
      } = govContracts;

      // Check ProposalCreated event
      const support = true;

      // Vote
      await expect(
        flashAttacks
          .connect(user6)
          .flashVote(minimumPower, proposal2Id, support)
      )
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, flashAttacks.address, support, "0");
    });
    it("Prevent to vote twice", async () => {
      // Vote
      const {
        governance,
        governanceStrategy,
        users: [user2],
      } = govContracts;
      // User 2 + User 5 delegation = 20% power, voting yes
      //  user 2 has received delegation from user 5
      const power2 = await governanceStrategy.getVotingPowerAt(
        user2.address,
        startBlock
      );
      await expect(governance.connect(user2).submitVote(proposal2Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal2Id, user2.address, true, power2);
      await expect(
        governance.connect(user2).submitVote(proposal2Id, true)
      ).to.be.revertedWith("VOTE_ALREADY_SUBMITTED");
    });
    it("Vote should revert if proposal is closed", async () => {
      // Vote
      const {
        governance,
        users: [user2],
      } = govContracts;

      await mineBlockToHeight((await latestBlockNum()) + 20);
      await expect(
        governance.connect(user2).submitVote(proposal2Id, true)
      ).to.be.revertedWith("VOTING_CLOSED");
    });
  });
  describe("Testing cancel function on active proposal", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("active") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      snapshots.set("active", await evmSnapshot());
    });
    it("should not cancel when Threshold is higher than minimum and not guardian", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // giving threshold power
      await setBalance(user, minimumCreatePower, govContracts);
      // not guardian, no threshold
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("PROPOSITION_CANCELLATION_INVALID");
    });
    it("should cancel a active proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should not cancel when proposition already canceled", async () => {
      const {
        governance,
        guardian,
        users: [user],
        executor,
      } = govContracts;
      // removing threshold power
      // cancelled
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
      await expect(
        governance.connect(guardian).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
    });
    it("should cancel active prop by guardian, when creator still above threshold", async () => {
      const {
        governance,
        guardian,
        users: [user],
        executor,
      } = govContracts;
      // giving threshold power to creator
      await setBalance(user, minimumCreatePower, govContracts);
      // cancel as guardian
      await expect(governance.connect(guardian).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should cancel an active proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);

      // active
      await expectProposalState(
        proposal2Id,
        proposalStates.ACTIVE,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
  });
  describe("Testing cancel function pending proposal", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("pending") || "1");
      await expectProposalState(
        proposal2Id,
        proposalStates.PENDING,
        govContracts
      );
      snapshots.set("pending", await evmSnapshot());
    });
    it("should not cancel when Threshold is higher than minimum and not guardian", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // giving threshold power
      await setBalance(user, minimumCreatePower, govContracts);
      // not guardian, no threshold
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("PROPOSITION_CANCELLATION_INVALID");
    });
    it("should cancel a pending proposal when threshold lost and not guardian", async () => {
      const {
        governance,
        executor,
        users: [user],
      } = govContracts;
      // removing threshold power
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // pending
      await expectProposalState(
        proposal2Id,
        proposalStates.PENDING,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
    it("should not cancel when proposition already canceled", async () => {
      const {
        governance,
        guardian,
        executor,
        users: [user],
      } = govContracts;
      // removing threshold power
      // cancelled
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);
      // pending
      await expectProposalState(
        proposal2Id,
        proposalStates.PENDING,
        govContracts
      );
      await expect(governance.connect(user).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
      await expect(
        governance.connect(user).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
      await expect(
        governance.connect(guardian).cancel(proposal2Id)
      ).to.be.revertedWith("ONLY_BEFORE_EXECUTED");
    });
    it("should cancel pending prop by guardian, when creator still above threshold", async () => {
      const {
        governance,
        guardian,
        users: [user],
        executor,
      } = govContracts;
      // giving threshold power to creator
      await setBalance(user, minimumCreatePower, govContracts);
      // cancel as guardian
      await expect(governance.connect(guardian).cancel(proposal2Id))
        .to.emit(governance, "ProposalCanceled")
        .withArgs(proposal2Id)
        .to.emit(executor, "CancelledAction");
      await expectProposalState(
        proposal2Id,
        proposalStates.CANCELED,
        govContracts
      );
    });
  });
  describe("Testing create function", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());
      const { governance } = govContracts;
      let currentCount = await governance.getProposalsCount();
      proposal2Id = currentCount.eq("0") ? currentCount : currentCount.sub("1");
    });
    it("should not create a proposal when proposer has not enought power", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // Give not enough AAVE for proposition tokens
      await setBalance(user, minimumCreatePower.sub("1"), govContracts);

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [
        executor.address,
        [ZERO_ADDRESS],
        ["0"],
        [""],
        ["0x"],
        [false],
        ipfsBytes32Hash,
      ];

      // Create proposal
      await expect(
        governance.connect(user).create(...params)
      ).to.be.revertedWith("PROPOSITION_CREATION_INVALID");
    });
    it("should create proposal when enough power", async () => {
      const {
        governance,
        users: [user],
        executor,
        governanceStrategy,
      } = govContracts;

      // Count current proposal id
      const count = await governance.connect(user).getProposalsCount();

      // give enough power
      await setBalance(user, minimumCreatePower, govContracts);

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [
        executor.address,
        [ZERO_ADDRESS],
        ["0"],
        [""],
        ["0x"],
        [false],
        ipfsBytes32Hash,
      ];

      // Create proposal
      const tx = await governance.connect(user).create(...params);
      // Check ProposalCreated event
      const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
      const endBlock = startBlock.add(votingDuration);
      const [
        executorAddress,
        targets,
        values,
        signatures,
        calldatas,
        withDelegateCalls,
        ipfsHash,
      ] = params;

      await expect(Promise.resolve(tx))
        .to.emit(governance, "ProposalCreated")
        .withArgs(
          count,
          user.address,
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          startBlock,
          endBlock,
          governanceStrategy.address,
          ipfsHash
        );
      await expectProposalState(count, proposalStates.PENDING, govContracts);
    });
    it("should create proposal when enough power via delegation", async () => {
      const {
        governance,
        users: [user, user2],
        executor,
        bendToken,
        governanceStrategy,
      } = govContracts;

      // Count current proposal id
      const count = await governance.connect(user).getProposalsCount();

      // give enough power
      await setBalance(
        user,
        minimumCreatePower.div("2").add("1"),
        govContracts
      );
      await setBalance(
        user2,
        minimumCreatePower.div("2").add("1"),
        govContracts
      );
      await waitForTx(await bendToken.connect(user2).delegate(user.address));

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [
        executor.address,
        [ZERO_ADDRESS],
        ["0"],
        [""],
        ["0x"],
        [false],
        ipfsBytes32Hash,
      ];

      // Create proposal
      const tx = await governance.connect(user).create(...params);
      // Check ProposalCreated event
      const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
      const endBlock = startBlock.add(votingDuration);
      const [
        executorAddress,
        targets,
        values,
        signatures,
        calldatas,
        withDelegateCalls,
        ipfsHash,
      ] = params;

      await expect(Promise.resolve(tx))
        .to.emit(governance, "ProposalCreated")
        .withArgs(
          count,
          user.address,
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          startBlock,
          endBlock,
          governanceStrategy.address,
          ipfsHash
        );
      await expectProposalState(count, proposalStates.PENDING, govContracts);
    });
    it("should not create a proposal without targets", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // Give enought AAVE for proposition tokens
      await setBalance(user, minimumCreatePower, govContracts);

      // Params with no target
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [], ["0"], [""], ["0x"], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(
        governance.connect(user).create(...params)
      ).to.be.revertedWith("INVALID_EMPTY_TARGETS");
    });
    it("should not create a proposal with unauthorized executor", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // Give enought AAVE for proposition tokens
      await setBalance(user, minimumCreatePower, govContracts);

      // Params with not authorized user as executor
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [
        user.address,
        [ZERO_ADDRESS],
        ["0"],
        [""],
        ["0x"],
        [false],
        ipfsBytes32Hash,
      ];

      // Create proposal
      await expect(
        governance.connect(user).create(...params)
      ).to.be.revertedWith("EXECUTOR_NOT_AUTHORIZED");
    });
    it("should not create a proposal with less targets than calldata", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // Give enought AAVE for proposition tokens
      await setBalance(user, minimumCreatePower, govContracts);

      // Params with no target
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [], ["0"], [""], ["0x"], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(
        governance.connect(user).create(...params)
      ).to.be.revertedWith("INVALID_EMPTY_TARGETS");
    });
    it("should not create a proposal with inconsistent data", async () => {
      const {
        governance,
        users: [user],
        executor,
      } = govContracts;
      // Give enought AAVE for proposition tokens
      await setBalance(user, minimumCreatePower, govContracts);

      const params: (
        targetsLength: number,
        valuesLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = (
        targetsLength: number,
        valueLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        executor.address,
        Array(targetsLength).fill(ZERO_ADDRESS),
        Array(valueLength).fill("0"),
        Array(signaturesLength).fill(""),
        Array(calldataLength).fill("0x"),
        Array(withDelegatesLength).fill(false),
        ipfsBytes32Hash,
      ];

      // Create proposal
      await expect(
        governance.connect(user).create(...params(2, 1, 1, 1, 1))
      ).to.be.revertedWith("INCONSISTENT_PARAMS_LENGTH");
      await expect(
        governance.connect(user).create(...params(1, 2, 1, 1, 1))
      ).to.be.revertedWith("INCONSISTENT_PARAMS_LENGTH");
      await expect(
        governance.connect(user).create(...params(0, 1, 1, 1, 1))
      ).to.be.revertedWith("INVALID_EMPTY_TARGETS");
      await expect(
        governance.connect(user).create(...params(1, 1, 2, 1, 1))
      ).to.be.revertedWith("INCONSISTENT_PARAMS_LENGTH");
      await expect(
        governance.connect(user).create(...params(1, 1, 1, 2, 1))
      ).to.be.revertedWith("INCONSISTENT_PARAMS_LENGTH");
      await expect(
        governance.connect(user).create(...params(1, 1, 1, 1, 2))
      ).to.be.revertedWith("INCONSISTENT_PARAMS_LENGTH");
    });
    it("should create a proposals with different data lengths", async () => {
      const {
        governance,
        users: [user],
        executor,
        governanceStrategy,
      } = govContracts;
      // Give enought AAVE for proposition tokens
      await setBalance(user, minimumCreatePower, govContracts);

      const params: (
        targetsLength: number,
        valuesLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = (
        targetsLength: number,
        valueLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        executor.address,
        Array(targetsLength).fill(ZERO_ADDRESS),
        Array(valueLength).fill("0"),
        Array(signaturesLength).fill(""),
        Array(calldataLength).fill("0x"),
        Array(withDelegatesLength).fill(false),
        ipfsBytes32Hash,
      ];
      for (let i = 1; i < 12; i++) {
        const count = await governance.connect(user).getProposalsCount();
        const tx = await governance
          .connect(user)
          .create(...params(i, i, i, i, i));
        const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
        const endBlock = startBlock.add(votingDuration);
        const [
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          ipfsHash,
        ] = params(i, i, i, i, i);

        await expect(Promise.resolve(tx))
          .to.emit(governance, "ProposalCreated")
          .withArgs(
            count,
            user.address,
            executorAddress,
            targets,
            values,
            signatures,
            calldatas,
            withDelegateCalls,
            startBlock,
            endBlock,
            governanceStrategy.address,
            ipfsHash
          );
      }
    });
  });
  describe("Testing create function", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());
    });
    it("Should not allow Flash proposal", async () => {
      const {
        users: [, , , , , user6],
        executor,
      } = govContracts;

      // Params for proposal
      const params: [
        BigNumberish,
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [
        minimumCreatePower,
        executor.address,
        [ZERO_ADDRESS],
        ["0"],
        [""],
        ["0x"],
        [false],
        ipfsBytes32Hash,
      ];

      // Try to create proposal
      await expect(
        flashAttacks.connect(user6).flashProposal(...params)
      ).to.be.revertedWith("PROPOSITION_CREATION_INVALID");
    });
  });
  describe("Testing setter functions", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());
    });

    it("Set governance governanceStrategy", async () => {
      const { governance, bendToken, stakedToken } = govContracts;

      const governanceStrategy = await deployGovernanceStrategy(
        bendToken,
        stakedToken
      );
      // impersonate executor

      // Set new governanceStrategy
      await governance
        .connect(executorSigner)
        .setGovernanceStrategy(governanceStrategy.address);
      const govStrategy = await governance.getGovernanceStrategy();

      expect(govStrategy).to.equal(governanceStrategy.address);
    });

    it("Set voting delay", async () => {
      const { governance, deployer } = govContracts;

      // Set voting delay
      await governance.connect(executorSigner).setVotingDelay("10");
      const govVotingDelay = await governance.getVotingDelay();

      expect(govVotingDelay).to.equal("10");
    });
  });
  describe("Testing executor auth/unautho functions", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());
    });

    it("Unauthorize executor", async () => {
      const { governance, executor } = govContracts;

      // Unauthorize executor
      await governance
        .connect(executorSigner)
        .unauthorizeExecutors([executor.address]);
      const isAuthorized = await governance
        .connect(executorSigner)
        .isExecutorAuthorized(executor.address);

      expect(isAuthorized).to.equal(false);
    });

    it("Authorize executor", async () => {
      const { governance, executor } = govContracts;

      // Authorize
      await governance
        .connect(executorSigner)
        .authorizeExecutors([executor.address]);
      const isAuthorized = await governance
        .connect(executorSigner)
        .isExecutorAuthorized(executor.address);

      expect(isAuthorized).to.equal(true);
    });
    it("Revert setDelay due is not executor", async () => {
      const { executor } = govContracts;

      await expect(
        executor.setDelay(await executor.MINIMUM_DELAY())
      ).to.be.revertedWith("ONLY_BY_THIS_TIMELOCK");
    });
    it("Revert setDelay due is out of minimum delay", async () => {
      const { executor } = govContracts;

      await expect(
        executor.connect(executorSigner).setDelay("0")
      ).to.be.revertedWith("DELAY_SHORTER_THAN_MINIMUM");
    });
    it("Revert setDelay due is out of max delay", async () => {
      const { executor } = govContracts;

      await expect(
        executor
          .connect(executorSigner)
          .setDelay(await (await executor.MAXIMUM_DELAY()).add("1"))
      ).to.be.revertedWith("DELAY_LONGER_THAN_MAXIMUM");
    });
    it("setDelay should pass delay", async () => {
      const { executor } = govContracts;

      await expect(
        executor.connect(executorSigner).setDelay(await executor.getDelay())
      ).to.emit(executor, "NewDelay");
    });
    it("Revert queueTransaction due caller is not admin", async () => {
      const { executor } = govContracts;

      await expect(
        executor
          .connect(executorSigner)
          .queueTransaction(ZERO_ADDRESS, "0", "", [], "0", false)
      ).to.be.revertedWith("ONLY_BY_ADMIN");
    });

    it("Revert queueTransaction due executionTime is less than delay", async () => {
      const { executor } = govContracts;

      await expect(
        executor
          .connect(govSigner)
          .queueTransaction(ZERO_ADDRESS, "0", "", [], "0", false)
      ).to.be.revertedWith("EXECUTION_TIME_UNDERESTIMATED");
    });
    it("Revert executeTransaction due action does not exist", async () => {
      const { executor } = govContracts;

      await expect(
        executor
          .connect(govSigner)
          .executeTransaction(ZERO_ADDRESS, "0", "", [], "0", false)
      ).to.be.revertedWith("ACTION_NOT_QUEUED");
    });

    it("Revert acceptAdmin due caller is not a pending admin", async () => {
      const { executor } = govContracts;

      await expect(
        executor.connect(executorSigner).acceptAdmin()
      ).to.be.revertedWith("ONLY_BY_PENDING_ADMIN");
    });
    it("Revert constructor due delay is shorted than minimum", async () => {
      await expect(
        deployExecutor(ZERO_ADDRESS, 1, 0, 2, 3, 0, 0, 0, 0)
      ).to.be.revertedWith("DELAY_SHORTER_THAN_MINIMUM");
    });
    it("Revert constructor due delay is longer than maximum", async () => {
      await expect(
        deployExecutor(ZERO_ADDRESS, 1, 0, 0, 0, 0, 0, 0, 0)
      ).to.be.revertedWith("DELAY_LONGER_THAN_MAXIMUM");
    });
  });
  describe("Testing guardian functions", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());
    });
    it("Revert abdication due not guardian", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;

      await expect(governance.connect(user).__abdicate()).to.be.revertedWith(
        "ONLY_BY_GUARDIAN"
      );
    });
    it("Abdicate guardian", async () => {
      const {
        governance,
        deployer,
        guardian,
        users: [user],
      } = govContracts;

      await governance.connect(guardian).__abdicate();
      const _guardian = await governance.connect(deployer).getGuardian();
      expect(_guardian).to.equal(ZERO_ADDRESS);
    });
  });
  describe("Testing queue duplicate actions", function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get("start") || "1");
      snapshots.set("start", await evmSnapshot());

      const { governance, executor, bendToken, users } = govContracts;
      const [user1, user2] = users;
      const encodedArgument3 = hre.ethers.utils.defaultAbiCoder.encode(
        ["address"],
        [user1.address]
      );
      await setBalance(user1, minimumCreatePower, govContracts);
      await setBalance(user2, minimumPower, govContracts);

      await mineBlock();

      const tx4 = await waitForTx(
        await governance
          .connect(user1)
          .create(
            executor.address,
            [executor.address, executor.address],
            ["0", "0"],
            ["setPendingAdmin(address)", "setPendingAdmin(address)"],
            [encodedArgument3, encodedArgument3],
            [false, false],
            ipfsBytes32Hash
          )
      );
      proposal4Id = tx4.events?.[0].args?.id;

      await expectProposalState(
        proposal4Id,
        proposalStates.PENDING,
        govContracts
      );

      const txStartBlock = BigNumber.from(tx4.blockNumber).add(votingDelay);
      const txEndBlock = BigNumber.from(tx4.blockNumber)
        .add(votingDelay)
        .add(votingDuration);

      await mineBlockToHeight(Number(txStartBlock.add(2).toString()));
      await expectProposalState(
        proposal4Id,
        proposalStates.ACTIVE,
        govContracts
      );

      await expect(governance.connect(user2).submitVote(proposal4Id, true))
        .to.emit(governance, "VoteEmitted")
        .withArgs(proposal4Id, user2.address, true, minimumPower);
      // go to end of voting period
      await mineBlockToHeight(Number(txEndBlock.add("3").toString()));
      await expectProposalState(
        proposal4Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
    });

    it("Should not queue a proposal action twice", async () => {
      const {
        governance,
        users: [user],
      } = govContracts;
      // Queue
      await expect(governance.connect(user).queue(proposal4Id)).to.revertedWith(
        "DUPLICATED_ACTION"
      );
      await expectProposalState(
        proposal4Id,
        proposalStates.SUCCEEDED,
        govContracts
      );
    });
  });
});
