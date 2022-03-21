import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber, constants, ContractFactory } from "ethers";
import {
  deployLockupBendFactory,
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
  assertAlmostEqual,
} from "../utils";

const provider = ethers.provider;

const H = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const MAXTIME = 126144000;

describe("LockupBendFactory tests", () => {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let bendToken: Contract;
  let vebend: Contract;
  let WETH: Contract;
  let bToken: Contract;
  let lendPoolAddressesProvider: Contract;
  let bendCollector: SignerWithAddress; //should be contract, here just for test
  let feeDistributor: Contract;
  let factory: Contract;
  let delegateRegistry: Contract;

  const snapshots = new Snapshots();

  before(async () => {
    let addresses = await ethers.getSigners();
    [deployer, bendCollector] = addresses;

    users = addresses.slice(2, addresses.length);

    bendToken = await deployBendTokenTester(deployer, makeBN18(10 ** 8));
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

    delegateRegistry = await deployContract("DelegateRegistry");

    factory = await deployLockupBendFactory(
      WETH,
      bendToken,
      vebend,
      feeDistributor,
      delegateRegistry
    );
    await bendToken.setBalance(factory.address, makeBN18(21 * 10 ** 6));

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
    totalAmount: BigNumber
  ) {
    let _beneficiaries: [string, BigNumber][] = [];
    beneficiaries.forEach((v, i) => {
      _beneficiaries.push([v.address, makeBN(thousandths[i])]);
    });
    await factory.createLock(_beneficiaries, totalAmount);
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
    let createLockTime: BigNumber;
    let lockupBendF: ContractFactory;

    before(async () => {
      lockupBendF = await ethers.getContractFactory("LockupBend");
      createLockTime = await moveToNextWeek();
      beneficiaries = users.slice(0, 11);
      thousandths = [150, 150, 100, 100, 100, 100, 75, 75, 50, 50, 50];
      totalAmount = makeBN18(21 * 10 ** 6);
      await createLock(beneficiaries, thousandths, totalAmount);
      await snapshots.capture("createLock");
    });
    afterEach(async () => {
      await snapshots.revert("createLock");
    });

    it("delegation", async () => {
      let id = ethers.utils.formatBytes32String("benddao.eth");

      for (let i = 0; i < 3; i++) {
        let lockupAddress = await factory.lockups(i);

        let delegation = await delegateRegistry.delegation(lockupAddress, id);

        expect(delegation).to.be.equal(constants.AddressZero);

        await factory.delegateSnapshotVotePower(i, id, deployer.address);

        delegation = await delegateRegistry.delegation(lockupAddress, id);
        expect(delegation).to.be.equal(deployer.address);
      }
      await expect(
        factory.delegateSnapshotVotePower(3, id, deployer.address)
      ).to.be.revertedWith("Index over range");

      for (let i = 0; i < 3; i++) {
        await factory.clearDelegateSnapshotVotePower(i, id);
        let lockupAddress = await factory.lockups(i);

        let delegation = await delegateRegistry.delegation(lockupAddress, id);

        expect(delegation).to.be.equal(constants.AddressZero);
      }
      await expect(
        factory.clearDelegateSnapshotVotePower(3, id)
      ).to.be.revertedWith("Index over range");
    });

    it("check lock state", async () => {
      for (let i = 0; i < 3; i++) {
        let lockupAddress = await factory.lockups(i);
        let lockupContract = lockupBendF.attach(lockupAddress);

        let unlockStartTime = await lockupContract.unlockStartTime();
        let lockEndTime = await lockupContract.lockEndTime();
        let unlockTime = createLockTime.add((i + 1) * YEAR);

        expect(unlockStartTime).to.be.equal(unlockTime);
        expect(lockEndTime.sub(unlockStartTime)).to.be.equal(YEAR);

        for (let i = 0; i < 11; i++) {
          let locked = await lockupContract.locked(beneficiaries[i].address);
          expect(locked.amount).to.be.equal(
            totalAmount.mul(thousandths[i]).div(1000).div(3)
          );
        }
        expect(await bendToken.balanceOf(lockupContract.address)).to.be.equal(
          0
        );
      }
      expect(await bendToken.balanceOf(vebend.address)).to.be.equal(
        totalAmount
      );
      expect(await bendToken.balanceOf(factory.address)).to.be.equal(0);
    });

    it("before unlock 1", async () => {
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR), async (time) => {
            await mineBlockAtTime(createLockTime.add(time).toNumber());

            for (let i = 0; i < 3; i++) {
              let lockupAddress = await factory.lockups(i);
              let lockupContract = lockupBendF.attach(lockupAddress);

              for (let i = 0; i < 11; i++) {
                let addr = beneficiaries[i].address;
                let locked = await lockupContract.locked(
                  beneficiaries[i].address
                );
                expect(await lockupContract.lockedAmount(addr)).to.be.equal(
                  locked.amount
                );
                let withdrawAmount = await lockupContract.withdrawable(addr);
                expect(withdrawAmount).to.be.equal(0);
              }
            }
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
    function computeLockAmount(totalLocked: BigNumber, timePassed: number) {
      return totalLocked.mul(YEAR - timePassed).div(YEAR);
    }

    it("during unlock 1", async () => {
      let unlockTime = createLockTime.add(YEAR);
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            let lockupAddress = await factory.lockups(0);
            let lockupContract = lockupBendF.attach(lockupAddress);

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract.locked(addr);
              let lockedAmount = await lockupContract.lockedAmount(addr);
              let withdrawAmount = await lockupContract.withdrawable(addr);
              let computedAmount = computeLockAmount(locked.amount, timePassed);
              assertAlmostEqual(lockedAmount, computedAmount, 1);
              assertAlmostEqual(
                lockedAmount.add(withdrawAmount),
                locked.amount,
                1
              );
            }

            for (let i = 1; i < 3; i++) {
              let lockupAddress = await factory.lockups(i);
              let lockupContract = lockupBendF.attach(lockupAddress);

              for (let i = 0; i < 11; i++) {
                let addr = beneficiaries[i].address;
                let locked = await lockupContract.locked(
                  beneficiaries[i].address
                );
                expect(await lockupContract.lockedAmount(addr)).to.be.equal(
                  locked.amount
                );
                let withdrawAmount = await lockupContract.withdrawable(addr);
                expect(withdrawAmount).to.be.equal(0);
              }
            }
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });

    it("during unlock 2", async () => {
      let unlockTime = createLockTime.add(2 * YEAR);
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            let lockupContract = lockupBendF.attach(await factory.lockups(0));

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract.locked(addr);
              let lockedAmount = await lockupContract.lockedAmount(addr);
              let withdrawAmount = await lockupContract.withdrawable(addr);
              expect(lockedAmount).to.be.equal(0);
              expect(withdrawAmount).to.be.equal(locked.amount);
            }

            lockupContract = lockupBendF.attach(await factory.lockups(1));

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract.locked(addr);
              let lockedAmount = await lockupContract.lockedAmount(addr);
              let withdrawAmount = await lockupContract.withdrawable(addr);
              let computedAmount = computeLockAmount(locked.amount, timePassed);
              assertAlmostEqual(lockedAmount, computedAmount, 1);
              assertAlmostEqual(
                lockedAmount.add(withdrawAmount),
                locked.amount,
                1
              );
            }

            lockupContract = lockupBendF.attach(await factory.lockups(2));

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract.locked(
                beneficiaries[i].address
              );
              expect(await lockupContract.lockedAmount(addr)).to.be.equal(
                locked.amount
              );
              let withdrawAmount = await lockupContract.withdrawable(addr);
              expect(withdrawAmount).to.be.equal(0);
            }
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });

    it("during unlock 3", async () => {
      let unlockTime = createLockTime.add(3 * YEAR);
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            for (let i = 0; i < 2; i++) {
              let lockupContract = lockupBendF.attach(await factory.lockups(i));

              for (let i = 0; i < 11; i++) {
                let addr = beneficiaries[i].address;
                let locked = await lockupContract.locked(addr);
                let lockedAmount = await lockupContract.lockedAmount(addr);
                let withdrawAmount = await lockupContract.withdrawable(addr);
                expect(lockedAmount).to.be.equal(0);
                expect(withdrawAmount).to.be.equal(locked.amount);
              }
            }

            let lockupContract = lockupBendF.attach(await factory.lockups(2));

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract.locked(addr);
              let lockedAmount = await lockupContract.lockedAmount(addr);
              let withdrawAmount = await lockupContract.withdrawable(addr);
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

    it("withdraw during unlock 1", async () => {
      let unlockTime = createLockTime.add(YEAR);
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR - DAY), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            let lockupContract1 = lockupBendF.attach(await factory.lockups(0));

            let lockupBendAmount = (
              await bendToken.balanceOf(vebend.address)
            ).div(3);
            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupContract1.locked(addr);

              let userBalanceBefore = await bendToken.balanceOf(addr);
              await factory.connect(beneficiaries[i]).withdraw();
              let userBalanceAfter = await bendToken.balanceOf(addr);
              let userBalance = userBalanceAfter.sub(userBalanceBefore);

              let lockedAmount = await lockupContract1.lockedAmount(addr);

              expect(userBalance).to.be.equal(locked.amount.sub(lockedAmount));

              // assertAlmostEqualTol(
              //   userBalance,
              //   locked.amount.sub(lockedAmount),
              //   0.000001
              // );

              expect((await lockupContract1.locked(addr)).amount).to.be.equal(
                locked.amount.sub(userBalance)
              );
              lockupBendAmount = lockupBendAmount.sub(userBalance);

              expect(
                await bendToken.balanceOf(lockupContract1.address)
              ).to.be.equal(lockupBendAmount);
            }

            expect(await bendToken.balanceOf(vebend.address)).to.be.equal(
              totalAmount.div(3).mul(2)
            );
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    }).timeout(100000);
    it("withdraw during unlock 2", async () => {
      let unlockTime = createLockTime.add(2 * YEAR);
      await fc.assert(
        fc
          .asyncProperty(fc.integer(1, YEAR - DAY), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            let lockupContract1 = lockupBendF.attach(await factory.lockups(0));
            let lockupContract2 = lockupBendF.attach(await factory.lockups(1));

            let lockupBendAmount = (
              await bendToken.balanceOf(vebend.address)
            ).div(3);

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;

              let locked = await lockupContract2.locked(addr);
              let userBalanceBefore = await bendToken.balanceOf(addr);
              await factory.connect(beneficiaries[i]).withdraw();
              let userBalanceAfter = await bendToken.balanceOf(addr);
              let userBalance = userBalanceAfter.sub(userBalanceBefore);

              expect(await lockupContract1.lockedAmount(addr)).to.be.equal(0);
              expect((await lockupContract1.locked(addr)).amount).to.be.equal(
                0
              );
              expect(await lockupContract1.withdrawable(addr)).to.be.equal(0);

              let lockedAmount = await lockupContract2.lockedAmount(addr);
              userBalance = userBalance.sub(
                totalAmount.mul(thousandths[i]).div(3000)
              );

              expect(userBalance).to.be.equal(locked.amount.sub(lockedAmount));

              // assertAlmostEqualTol(
              //   userBalance,
              //   locked.amount.sub(lockedAmount),
              //   0.000001
              // );

              expect((await lockupContract2.locked(addr)).amount).to.be.equal(
                locked.amount.sub(userBalance)
              );
              lockupBendAmount = lockupBendAmount.sub(userBalance);

              expect(
                await bendToken.balanceOf(lockupContract2.address)
              ).to.be.equal(lockupBendAmount);
            }

            expect(await bendToken.balanceOf(vebend.address)).to.be.equal(
              totalAmount.div(3)
            );
          })
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    }).timeout(100000);

    it("claim during unlock 1", async () => {
      let unlockTime = createLockTime.add(YEAR);
      let time = await timeLatest();
      await feeDistributor.start();
      await mineBlockAndIncreaseTime(DAY);

      for (let i = 0; i < 20; i++) {
        await mintBToken(bendCollector.address, makeBN18(70));
        await feeDistributor.distribute();
        time = time.add(WEEK);
        await mineBlockAtTime(time.toNumber());
      }
      await increaseTime(WEEK);
      await feeDistributor.distribute();
      let totalClaimed = makeBN(0);
      for (let i = 0; i < 11; i++) {
        let addr = beneficiaries[i].address;
        let t = thousandths[i];
        let wethBalanceBefore = await WETH.balanceOf(addr);
        await factory.connect(beneficiaries[i]).claim(true);
        let wethBalanceAfter = await WETH.balanceOf(addr);
        let wethBalance = wethBalanceAfter.sub(wethBalanceBefore);
        totalClaimed = totalClaimed.add(wethBalance);
        assertAlmostEqualTol(
          wethBalance,
          makeBN18(70 * 20)
            .mul(t)
            .div(1000),
          0.0000001
        );
      }
      let wethBalanceBefore = await WETH.balanceOf(factory.address);
      await factory.withdrawResidue();
      let wethBalanceAfter = await WETH.balanceOf(factory.address);
      let wethWithdran = wethBalanceBefore.sub(wethBalanceAfter);
      assertAlmostEqual(totalClaimed.add(wethWithdran), makeBN18(70 * 20), 100);
    });
    it("claim after unlocked", async () => {
      let unlockTime = createLockTime.add(3 * YEAR);
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

      for (let i = 0; i < 11; i++) {
        let addr = beneficiaries[i].address;
        let t = thousandths[i];
        let wethBalanceBefore = await WETH.balanceOf(addr);
        await factory.connect(beneficiaries[i]).claim(true);
        let wethBalanceAfter = await WETH.balanceOf(addr);
        let wethBalance = wethBalanceAfter.sub(wethBalanceBefore);
        assertAlmostEqualTol(
          wethBalance,
          makeBN18(70 * 50)
            .mul(t)
            .div(1000),
          0.0000001
        );
      }

      await increaseTime(WEEK);
      await mintBToken(bendCollector.address, makeBN18(100));
      await feeDistributor.distribute();

      for (let i = 0; i < 11; i++) {
        let addr = beneficiaries[i].address;
        let t = thousandths[i];
        let wethBalanceBefore = await WETH.balanceOf(addr);
        await factory.connect(beneficiaries[i]).claim(true);
        let wethBalanceAfter = await WETH.balanceOf(addr);
        let wethBalance = wethBalanceAfter.sub(wethBalanceBefore);
        expect(wethBalance).to.be.equal(0);
      }
    });
  });
});
