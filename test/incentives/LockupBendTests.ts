import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber, constants } from "ethers";
import {
  deployLockupBend,
  deployFeeDistributor,
  deployBendTokenTester,
  deployVeBend,
  deployVault,
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
  assertAlmostEqual,
} from "../utils";

import { forEach } from "p-iteration";

const provider = ethers.provider;

const H = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const MAXTIME = 126144000;

describe("LockupBend tests", () => {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let vault: Contract;
  let bendToken: Contract;
  let vebend: Contract;
  let WETH: Contract;
  let bToken: Contract;
  let lendPoolAddressesProvider: Contract;
  let bendCollector: SignerWithAddress; //should be contract, here just for test
  let feeDistributor: Contract;
  let lockupBend: Contract;
  let delegation: Contract;

  const snapshots = new Snapshots();

  before(async () => {
    let addresses = await ethers.getSigners();
    [deployer, bendCollector] = addresses;

    users = addresses.slice(2, addresses.length);
    vault = await deployVault();
    bendToken = await deployBendTokenTester(vault, makeBN18(10 ** 8));
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

    delegation = await deployContract("DelegateRegistry");

    await bendToken.setBalance(deployer.address, makeBN18(21 * 10 ** 6));

    lockupBend = await deployLockupBend(
      WETH,
      bendToken,
      vebend,
      feeDistributor,
      delegation
    );
    await bendToken
      .connect(deployer)
      .approve(lockupBend.address, constants.MaxUint256);
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

  async function createLock(
    beneficiaries: SignerWithAddress[],
    thousandths: number[],
    totalAmount: BigNumber,
    unlockTime: BigNumber
  ) {
    let _beneficiaries: [string, BigNumber][] = [];
    beneficiaries.forEach((v, i) => {
      _beneficiaries.push([v.address, makeBN(thousandths[i])]);
    });
    await lockupBend.createLock(_beneficiaries, totalAmount, unlockTime);
  }

  async function moveToNextWeek() {
    let now = await timeLatest();
    let nextWeek = now.div(WEEK).add(1).mul(WEEK);
    let dt = nextWeek.sub(now);
    await increaseTime(dt.toNumber());
    return nextWeek;
  }

  makeSuite("#createLock", () => {
    let thousandths: number[];
    let beneficiaries: SignerWithAddress[];
    let totalAmount: BigNumber;
    let unlockTime: BigNumber;

    before(async () => {
      let nextWeek = await moveToNextWeek();
      beneficiaries = users.slice(0, 11);
      thousandths = [150, 150, 100, 100, 100, 100, 75, 75, 50, 50, 50];
      totalAmount = makeBN18(21 * 10 ** 6);
      unlockTime = nextWeek.add(YEAR);
      await createLock(beneficiaries, thousandths, totalAmount, unlockTime);
      await snapshots.capture("createLock");
    });
    afterEach(async () => {
      await snapshots.revert("createLock");
    });
    it("check lock state", async () => {
      let unlockStartTime = await lockupBend.unlockStartTime();
      let lockEndTime = await lockupBend.lockEndTime();
      expect(unlockStartTime).to.be.equal(unlockTime);
      expect(lockEndTime.sub(unlockStartTime)).to.be.equal(YEAR);

      for (let i = 0; i < 11; i++) {
        let locked = await lockupBend.locked(beneficiaries[i].address);
        expect(locked.amount).to.be.equal(
          totalAmount.mul(thousandths[i]).div(1000)
        );
      }

      expect(await bendToken.balanceOf(deployer.address)).to.be.equal(0);
      expect(await bendToken.balanceOf(lockupBend.address)).to.be.equal(0);
      expect(await bendToken.balanceOf(vebend.address)).to.be.equal(
        totalAmount
      );
    });

    it("before unlock", async () => {
      let now = await timeLatest();
      await fc.assert(
        fc
          .asyncProperty(
            fc.integer(now.toNumber() + 1, unlockTime.toNumber()),
            async (time) => {
              await mineBlockAtTime(time);

              for (let i = 0; i < 11; i++) {
                let addr = beneficiaries[i].address;
                let locked = await lockupBend.locked(beneficiaries[i].address);
                expect(await lockupBend.lockedAmount(addr)).to.be.equal(
                  locked.amount
                );
                let withdrawAmount = await lockupBend.withdrawable(addr);
                expect(withdrawAmount).to.be.equal(0);
              }
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
    function computeLockAmount(totalLocked: BigNumber, timePassed: number) {
      return totalLocked.mul(YEAR - timePassed).div(YEAR);
    }
    it("during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(fc.nat(YEAR), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupBend.locked(addr);
              let lockedAmount = await lockupBend.lockedAmount(addr);
              let withdrawAmount = await lockupBend.withdrawable(addr);
              let computedAmount = computeLockAmount(locked.amount, timePassed);
              assertAlmostEqual(lockedAmount, computedAmount, 1);
              assertAlmostEqual(
                lockedAmount.add(withdrawAmount),
                locked.amount,
                1
              );
            }
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
    it("withdraw during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(fc.nat(YEAR), async (timePassed) => {
            let totalBendAmount = await bendToken.balanceOf(vebend.address);
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupBend.locked(addr);
              await lockupBend.withdraw(addr);
              let lockedAmount = await lockupBend.lockedAmount(addr);
              let userBalance = await bendToken.balanceOf(addr);

              expect(userBalance).to.be.equal(locked.amount.sub(lockedAmount));

              expect((await lockupBend.locked(addr)).amount).to.be.equal(
                locked.amount.sub(userBalance)
              );
              totalBendAmount = totalBendAmount.sub(userBalance);

              expect(await bendToken.balanceOf(vebend.address)).to.be.equal(0);
              expect(await bendToken.balanceOf(lockupBend.address)).to.be.equal(
                totalBendAmount
              );
            }
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
    it("withdraw after unlocked", async () => {
      await mineBlockAtTime(unlockTime.add(YEAR).toNumber());
      let totalBendAmount = await bendToken.balanceOf(vebend.address);
      for (let i = 0; i < 11; i++) {
        let addr = beneficiaries[i].address;
        let locked = await lockupBend.locked(addr);

        await lockupBend.withdraw(addr);
        let userBalance = await bendToken.balanceOf(addr);
        expect(userBalance).to.be.equal(locked.amount);

        expect((await lockupBend.locked(addr)).amount).to.be.equal(0);
        expect(await lockupBend.lockedAmount(addr)).to.be.equal(0);

        expect(await bendToken.balanceOf(vebend.address)).to.be.equal(0);
        totalBendAmount = totalBendAmount.sub(userBalance);
        expect(await bendToken.balanceOf(lockupBend.address)).to.be.equal(
          totalBendAmount
        );
      }
    });
    it("claim during unlock", async () => {});
    it("claim after unlocked", async () => {
      let time = await timeLatest();
      await feeDistributor.start();
      await mineBlockAndIncreaseTime(DAY);
      for (let i = 0; i < 50; i++) {
        await mintBToken(bendCollector.address, makeBN18(70));
        await feeDistributor.distribute();
        // let tokensThisWeek = await feeDistributor.tokensPerWeek(time);
        time = time.add(WEEK);
        await mineBlockAtTime(time.toNumber());
      }

      await increaseTime(WEEK);
      await feeDistributor.distribute();

      await mineBlockAtTime(unlockTime.toNumber());

      let wethBalanceBefore = await WETH.balanceOf(deployer.address);
      await lockupBend.claim();
      let wethBalanceAfter = await WETH.balanceOf(deployer.address);
      assertAlmostEqualTol(
        wethBalanceAfter.sub(wethBalanceBefore),
        makeBN18(70 * 50),
        0.0000001
      );
      await increaseTime(WEEK);
      await mintBToken(bendCollector.address, makeBN18(100));
      await feeDistributor.distribute();
      wethBalanceBefore = await WETH.balanceOf(deployer.address);
      await lockupBend.claim();
      wethBalanceAfter = await WETH.balanceOf(deployer.address);
      expect(wethBalanceBefore).to.be.equal(wethBalanceAfter);
    });
  });
});
