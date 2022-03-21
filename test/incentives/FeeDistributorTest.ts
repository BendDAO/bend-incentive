import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber, constants } from "ethers";
import {
  deployFeeDistributor,
  deployBendTokenTester,
  deployVeBend,
  deployContract,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import fc from "fast-check";

fc.configureGlobal({
  numRuns: 10,
});

import {
  makeBN,
  makeBN18,
  timeLatest,
  latestBlockNum,
  Snapshots,
  mineBlockAtTime,
  increaseTime,
  mineBlockAndIncreaseTime,
  assertAlmostEqualTol,
} from "../utils";

import { forEach } from "p-iteration";
import exp from "constants";

const provider = ethers.provider;

const H = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const MAXTIME = 126144000;

describe("FeeDistributor tests", () => {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let bendToken: Contract;
  let vebend: Contract;
  let WETH: Contract;
  let bToken: Contract;
  let feeDistributor: Contract;
  let lendPoolAddressesProvider: Contract;
  let bendCollector: SignerWithAddress; //should be contract, here just for test

  const snapshots = new Snapshots();

  before(async () => {
    let addresses = await ethers.getSigners();
    [deployer, bendCollector] = addresses;

    users = addresses.slice(2, addresses.length);
    bendToken = await deployBendTokenTester(deployer, makeBN18(1000000));
    WETH = await deployContract("WETH9Tester");
    await deployer.sendTransaction({
      to: WETH.address,
      value: makeBN18(1000000000),
    });
    bToken = await deployContract("BTokenTester", [
      "bToken",
      "bToken",
      WETH.address,
    ]);
    await WETH.connect(bendCollector).approve(
      bToken.address,
      constants.MaxUint256
    );
    lendPoolAddressesProvider = await deployContract(
      "LendPoolAddressesProviderTester",
      [bToken.address, WETH.address]
    );
    vebend = await deployVeBend(bendToken);
    feeDistributor = await deployFeeDistributor(
      lendPoolAddressesProvider,
      vebend,
      WETH,
      bendCollector.address,
      bToken
    );
    await bToken
      .connect(bendCollector)
      .approve(feeDistributor.address, constants.MaxUint256);

    await forEach(users, async (user) => {
      await bendToken
        .connect(user)
        .approve(vebend.address, constants.MaxUint256);
      await bendToken.setBalance(user.address, makeBN18(10000));
    });
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

  async function mintBToken(address: string, amount: BigNumber) {
    await WETH.mint(address, amount);
    await bToken.mint(address, amount);
  }

  makeSuite("#checkpoints", () => {
    before(async () => {
      let time = await timeLatest();
      await vebend
        .connect(users[0])
        .createLock(makeBN18(1000), time.add(WEEK * 52));

      await snapshots.capture("checkpoints");
    });
    afterEach(async () => {
      await snapshots.revert("checkpoints");
    });
    it("check total supply", async () => {
      let startTime = await feeDistributor.timeCursor();
      let startEpoch = (await timeLatest()).add(WEEK).div(WEEK).mul(WEEK);
      await mineBlockAtTime(startEpoch.toNumber() + 1);
      let blockNum = await latestBlockNum();
      await feeDistributor.checkpointTotalSupply();
      expect(await feeDistributor.veSupply(startTime)).to.be.equal(0);
      expect(await feeDistributor.veSupply(startEpoch)).to.be.equal(
        await vebend.totalSupplyAt(blockNum)
      );
    });
    it("advance time cursor", async () => {
      let time = await timeLatest();
      await vebend
        .connect(users[0])
        .increaseUnlockTime(time.add(WEEK * 52 * 3));
      let startTime = await feeDistributor.timeCursor();
      mineBlockAndIncreaseTime(3 * YEAR);
      await feeDistributor.checkpointTotalSupply();
      expect(await feeDistributor.timeCursor()).to.be.equal(
        startTime.add(WEEK * 52)
      );
      expect(await feeDistributor.veSupply(startTime.add(WEEK * 51))).to.be.gt(
        0
      );
      expect(
        await feeDistributor.veSupply(startTime.add(WEEK * 52))
      ).to.be.equal(0);

      await feeDistributor.checkpointTotalSupply();
      expect(await feeDistributor.timeCursor()).to.be.equal(
        startTime.add(WEEK * 104)
      );
      expect(await feeDistributor.veSupply(startTime.add(WEEK * 52))).to.be.gt(
        0
      );
      expect(await feeDistributor.veSupply(startTime.add(WEEK * 103))).to.be.gt(
        0
      );
      expect(
        await feeDistributor.veSupply(startTime.add(WEEK * 104))
      ).to.be.equal(0);
    });

    it("claim checkpoint total supply", async () => {
      let time = await feeDistributor.timeCursor();
      await feeDistributor.connect(users[0]).claim(true);
      expect(await feeDistributor.timeCursor()).to.be.equal(time.add(WEEK));
    });
  });

  async function moveToNextWeek() {
    let now = await timeLatest();
    let nextWeek = now.div(WEEK).add(1).mul(WEEK);
    let dt = nextWeek.sub(now);
    await increaseTime(dt.toNumber());
    return nextWeek;
  }
  makeSuite("#distribute fee", () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    before(async () => {
      [alice, bob] = users;
      await snapshots.capture("distribute_fee");
    });
    afterEach(async () => {
      await snapshots.revert("distribute_fee");
    });

    it("will claim zero if no bToken distributed after lock", async () => {
      for (let i = 0; i < 36; i++) {
        await mintBToken(bendCollector.address, makeBN18(100));
        await feeDistributor.distribute();
        await feeDistributor.checkpointTotalSupply();
        await mineBlockAndIncreaseTime(DAY);
      }
      await mineBlockAndIncreaseTime(WEEK);
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(3 * WEEK));
      await increaseTime(2 * WEEK);
      let aliceClaimable = await feeDistributor.claimable(alice.address);
      await feeDistributor.connect(alice).claim(true);
      let aliceBalance = await WETH.balanceOf(alice.address);
      expect(aliceClaimable).to.be.equal(0);
      expect(aliceBalance).to.be.equal(0);
    });

    it("start distribute before lock", async () => {
      // Move to timing which is good for testing - beginning of a UTC week
      await feeDistributor.start();
      await moveToNextWeek();
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(8 * WEEK));

      await increaseTime(WEEK);

      for (let i = 0; i < 21; i++) {
        await mintBToken(bendCollector.address, makeBN18(10));

        expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(
          makeBN18(10)
        );
        await feeDistributor.distribute();
        expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);
        await mineBlockAndIncreaseTime(DAY);
      }

      await increaseTime(WEEK);
      await feeDistributor.distribute();

      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);

      let aliceClaimable = await feeDistributor.claimable(alice.address);

      await feeDistributor.connect(alice).claim(true);

      let aliceBalance = await WETH.balanceOf(alice.address);

      expect(aliceClaimable).to.be.equal(aliceBalance);
      assertAlmostEqualTol(aliceBalance, makeBN18(205), 0.0000001);
    });

    it("start distribute after lock", async () => {
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(8 * WEEK));

      await mineBlockAndIncreaseTime(WEEK);
      await feeDistributor.start();

      await increaseTime(5 * WEEK);

      await mintBToken(bendCollector.address, makeBN18(10));

      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(
        makeBN18(10)
      );
      await feeDistributor.distribute();
      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);
      await increaseTime(WEEK);
      await feeDistributor.distribute();

      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);

      let aliceClaimable = await feeDistributor.claimable(alice.address);
      await feeDistributor.connect(alice).claim(true);

      let aliceBalance = await WETH.balanceOf(alice.address);
      expect(aliceClaimable).to.be.equal(aliceBalance);
      assertAlmostEqualTol(aliceBalance, makeBN18(10), 0.0000001);
    });

    it("start distribute after lock 2", async () => {
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(4 * WEEK));

      await mineBlockAndIncreaseTime(WEEK);
      await feeDistributor.start();

      await increaseTime(3 * WEEK);
      await vebend.connect(alice).withdraw();

      let excludTime = (await timeLatest()).div(WEEK).mul(WEEK);
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(4 * WEEK));
      await increaseTime(2 * WEEK);

      await mintBToken(bendCollector.address, makeBN18(10));
      await feeDistributor.distribute();
      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);

      await increaseTime(WEEK);
      await feeDistributor.distribute();

      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);
      let aliceClaimable = await feeDistributor.claimable(alice.address);
      await feeDistributor.connect(alice).claim(true);

      let tokensExcluded = await feeDistributor.tokensPerWeek(excludTime);

      let aliceBalance = await WETH.balanceOf(alice.address);
      expect(aliceClaimable).to.be.equal(aliceBalance);
      assertAlmostEqualTol(
        aliceBalance.add(tokensExcluded),
        makeBN18(10),
        0.0000001
      );
    });
    it("start distribute after lock 3", async () => {
      await vebend
        .connect(alice)
        .createLock(makeBN18(10000), (await timeLatest()).add(8 * WEEK));

      await vebend
        .connect(bob)
        .createLock(makeBN18(10000), (await timeLatest()).add(8 * WEEK));

      await mineBlockAndIncreaseTime(WEEK);
      await feeDistributor.start();

      await increaseTime(5 * WEEK);

      await mintBToken(bendCollector.address, makeBN18(10));
      await feeDistributor.distribute();
      expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(0);

      await increaseTime(WEEK);
      await feeDistributor.distribute();
      expect(await bToken.balanceOf(alice.address)).to.be.equal(0);

      let aliceBalanceBefore = await provider.getBalance(alice.address);
      let bobBalanceBefore = await provider.getBalance(bob.address);
      let aliceClaimable = await feeDistributor.claimable(alice.address);
      let bobClaimable = await feeDistributor.claimable(bob.address);
      await feeDistributor.connect(alice).claim(false);
      await feeDistributor.connect(bob).claim(false);

      let aliceBalanceAfter = await provider.getBalance(alice.address);
      let bobBalanceAfter = await provider.getBalance(bob.address);
      let aliceBalance = aliceBalanceAfter.sub(aliceBalanceBefore);
      let bobBalance = bobBalanceAfter.sub(bobBalanceBefore);

      assertAlmostEqualTol(aliceClaimable, aliceBalance, 0.0001);
      assertAlmostEqualTol(bobClaimable, bobBalance, 0.0001);
      assertAlmostEqualTol(aliceBalance.add(bobBalance), makeBN18(10), 0.001);

      // claim twice
      aliceClaimable = await feeDistributor.claimable(alice.address);
      bobClaimable = await feeDistributor.claimable(bob.address);
      let aliceWethBalanceBefore = await WETH.balanceOf(alice.address);
      let bobWethBalanceBefore = await WETH.balanceOf(bob.address);
      await feeDistributor.connect(alice).claim(true);
      await feeDistributor.connect(bob).claim(true);
      let aliceWethBalanceAfter = await WETH.balanceOf(alice.address);
      let bobWethBalanceAfter = await WETH.balanceOf(bob.address);

      aliceBalance = aliceWethBalanceAfter.sub(aliceWethBalanceBefore);
      bobBalance = bobWethBalanceAfter.sub(bobWethBalanceBefore);

      expect(aliceClaimable).to.be.equal(0);
      expect(bobClaimable).to.be.equal(0);

      expect(aliceBalance).to.be.equal(0);
      expect(bobBalance).to.be.equal(0);
    });
  });

  makeSuite("#proptety based  tests", () => {
    it("check total supply", async () => {
      await fc.assert(
        fc
          .asyncProperty(
            fc.array(fc.double(1, 100), { minLength: 10, maxLength: 10 }),
            fc.array(fc.integer(1, 52), { minLength: 10, maxLength: 10 }),
            fc.array(fc.integer(1, 30), { minLength: 10, maxLength: 10 }),
            async (lockAmount, lockWeeks, sleepBeforeLock) => {
              let finalLock = makeBN(0);
              for (let i = 0; i < 10; i++) {
                let time = await timeLatest();
                let sleep = DAY * sleepBeforeLock[i];
                await increaseTime(sleep);
                time = time.add(sleep);

                let lockTime = time.add(WEEK * lockWeeks[i]);
                if (lockTime.gt(finalLock)) {
                  finalLock = lockTime;
                }
                await vebend
                  .connect(users[i])
                  .createLock(makeBN18(lockAmount[i]), lockTime);
              }

              while ((await timeLatest()).lt(finalLock)) {
                let weekEpoch = (await timeLatest())
                  .add(WEEK)
                  .div(WEEK)
                  .mul(WEEK);
                await mineBlockAtTime(weekEpoch.toNumber());
                let blockNum = await latestBlockNum();
                await increaseTime(1);

                for (let j = 0; j < 3; j++) {
                  await feeDistributor.checkpointTotalSupply();
                }
                expect(await feeDistributor.veSupply(weekEpoch)).to.be.equal(
                  await vebend.totalSupplyAt(blockNum)
                );
              }
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("init");
          })
      );
    }).timeout(100000);
  });
});
