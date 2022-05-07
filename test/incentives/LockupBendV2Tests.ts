import { ethers, upgrades } from "hardhat";
import { expect } from "chai";

import { Contract, BigNumber, constants } from "ethers";
import {
  deployBendTokenTester,
  deployContract,
  deployFeeDistributor,
  deployLockupBendFactory,
  deployLockupBendV2,
  deployVeBend,
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
  Snapshots,
  mineBlockAtTime,
  increaseTime,
  assertAlmostEqual,
  mineBlockAndIncreaseTime,
} from "../utils";

const DAY = 86400;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

describe("LockupBendV2 tests", () => {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let bendToken: Contract;
  let lockupBend: Contract;
  let vebend: Contract;
  let WETH: Contract;
  let bendCollector: SignerWithAddress; //should be contract, here just for test
  let lendPoolAddressesProvider: Contract;
  let feeDistributor: Contract;
  let delegateRegistry: Contract;
  let bToken: Contract;
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
    lockupBend = await deployLockupBendV2(
      WETH.address,
      bendToken.address,
      vebend.address,
      feeDistributor.address,
      delegateRegistry.address
    );
    await lockupBend.approve();
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

  async function createLock(
    beneficiaries: SignerWithAddress[],
    percentage: number[],
    totalAmount: BigNumber
  ) {
    let _beneficiaries: [string, BigNumber][] = [];
    beneficiaries.forEach((v, i) => {
      _beneficiaries.push([v.address, makeBN(percentage[i])]);
    });
    await lockupBend.createLock(_beneficiaries, totalAmount);
  }

  async function moveToNextWeek() {
    let now = await timeLatest();
    let nextWeek = now.div(WEEK).add(1).mul(WEEK);
    let dt = nextWeek.sub(now);
    await increaseTime(dt.toNumber());
    return nextWeek;
  }

  makeSuite("#createLock", () => {
    let percentage: number[];
    let beneficiaries: SignerWithAddress[];
    let totalAmount: BigNumber;
    let unlockTime: BigNumber;

    before(async () => {
      totalAmount = makeBN18(21 * 10 ** 6);
      await bendToken.setBalance(lockupBend.address, totalAmount);
      let nextWeek = await moveToNextWeek();
      beneficiaries = users.slice(0, 11);
      percentage = [
        1500, 1500, 1000, 1000, 1000, 1000, 750, 750, 500, 500, 500,
      ];
      unlockTime = nextWeek.add(YEAR);
      await createLock(beneficiaries, percentage, totalAmount);
      await snapshots.capture("createLock");
    });
    afterEach(async () => {
      await snapshots.revert("createLock");
    });
    it("check lock state", async () => {
      let unlockStartTime = await lockupBend.unlockStartTime();
      let lockEndTime = await lockupBend.lockEndTime();
      expect(unlockStartTime).to.be.equal(unlockTime);
      expect(lockEndTime.sub(unlockStartTime)).to.be.equal(3 * YEAR);

      for (let i = 0; i < 11; i++) {
        let locked = await lockupBend.locks(beneficiaries[i].address);
        expect(locked.amount).to.be.equal(
          totalAmount.mul(percentage[i]).div(10000)
        );
      }

      expect(await bendToken.balanceOf(lockupBend.address)).to.be.equal(
        totalAmount
      );
    });

    it("delegation", async () => {
      let id = ethers.utils.formatBytes32String("benddao.eth");
      let delegation = await delegateRegistry.delegation(
        lockupBend.address,
        id
      );
      expect(delegation).to.be.equal(constants.AddressZero);
      await lockupBend.delegateVote(id, deployer.address);
      delegation = await delegateRegistry.delegation(lockupBend.address, id);
      expect(delegation).to.be.equal(deployer.address);
      await lockupBend.clearDelegateVote(id);
      delegation = await delegateRegistry.delegation(lockupBend.address, id);
      expect(delegation).to.be.equal(constants.AddressZero);
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
                let locked = await lockupBend.locks(beneficiaries[i].address);
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
      return totalLocked.mul(3 * YEAR - timePassed).div(3 * YEAR);
    }
    it("during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(fc.nat(3 * YEAR), async (timePassed) => {
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupBend.locks(addr);
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

    it("create veBEND lock and burn rewards during unlock", async () => {
      function computeVeBendAmount(amount: BigNumber, lockTime: number) {
        return amount.div(126144000).mul(lockTime);
      }
      async function mintBToken(address: string, amount: BigNumber) {
        await WETH.mint(address, amount);
        await bToken.mint(address, amount, 0);
      }
      await fc.assert(
        fc
          .asyncProperty(
            fc.nat(3 * YEAR),
            fc.integer({ min: 1, max: 21 * 1e6 }),
            fc.integer({ min: 604800, max: 126144000 }),
            async (timePassed, lockAmount, lockTime) => {
              await mineBlockAtTime(unlockTime.add(timePassed).toNumber());
              let lockAmountBN = makeBN18(lockAmount);
              let veUnlockTime = unlockTime.add(timePassed).add(lockTime);
              await lockupBend.createVeLock(lockAmountBN, veUnlockTime);

              let veUnlockWeek =
                Math.floor(veUnlockTime.toNumber() / 604800) * 604800;
              lockTime = veUnlockWeek - unlockTime.add(timePassed).toNumber();

              expect(
                await vebend["balanceOf(address)"](lockupBend.address)
              ).to.be.equal(
                computeVeBendAmount(makeBN18(lockAmount), lockTime - 1)
              );
              let time = await timeLatest();
              await feeDistributor.start();
              for (let i = 0; i < 7; i++) {
                await mintBToken(bendCollector.address, makeBN18(70));
                await feeDistributor.distribute();
                time = time.add(DAY);
                await mineBlockAtTime(time.toNumber());
              }

              let rewards = await feeDistributor.claimable(lockupBend.address);
              let balanceBefore = await bToken.balanceOf(bendCollector.address);
              await lockupBend.refundVeRewards();
              let balanceAfter = await bToken.balanceOf(bendCollector.address);

              expect(rewards).to.be.equal(balanceAfter.sub(balanceBefore));
              expect(await bToken.balanceOf(bendCollector.address)).to.be.equal(
                rewards
              );
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });

    it("withdraw during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(fc.nat(3 * YEAR), async (timePassed) => {
            let totalBendAmount = await bendToken.balanceOf(lockupBend.address);
            await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

            for (let i = 0; i < 11; i++) {
              let addr = beneficiaries[i].address;
              let locked = await lockupBend.locks(addr);
              await lockupBend.connect(beneficiaries[i]).withdraw();
              let lockedAmount = await lockupBend.lockedAmount(addr);
              let userBalance = await bendToken.balanceOf(addr);

              expect(userBalance).to.be.equal(locked.amount.sub(lockedAmount));

              expect((await lockupBend.locks(addr)).amount).to.be.equal(
                locked.amount.sub(userBalance)
              );
              totalBendAmount = totalBendAmount.sub(userBalance);

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
    it("transfer between beneficiaries during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(
            fc.nat(3 * YEAR),
            fc.nat(10),
            fc.integer(1, 10),
            async (timePassed, oldIndex, newIndex) => {
              await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

              newIndex = (oldIndex + newIndex) % 11;

              let oldUser = beneficiaries[oldIndex].address;
              let newUser = beneficiaries[newIndex].address;

              let oldLockedBefore = await lockupBend.locks(oldUser);
              let newLockedBefore = await lockupBend.locks(newUser);

              let oldUserBalanceBefore = await bendToken.balanceOf(oldUser);
              await lockupBend.transferBeneficiary(oldUser, newUser);
              let oldUserBalanceAfter = await bendToken.balanceOf(oldUser);
              let oldUserWithdran =
                oldUserBalanceAfter.sub(oldUserBalanceBefore);
              let oldLockedAfter = await lockupBend.locks(oldUser);
              let newLockedAfter = await lockupBend.locks(newUser);

              expect(oldLockedAfter.amount).to.be.equal(0);
              expect(oldLockedAfter.slope).to.be.equal(0);

              expect(newLockedAfter.amount.add(oldUserWithdran)).to.be.equal(
                oldLockedBefore.amount.add(newLockedBefore.amount)
              );

              expect(newLockedAfter.slope).to.be.equal(
                oldLockedBefore.slope.add(newLockedBefore.slope)
              );
              await mineBlockAndIncreaseTime(3 * YEAR - timePassed);

              await lockupBend.connect(beneficiaries[newIndex]).withdraw();
              expect((await lockupBend.locks(newUser)).amount).to.be.equal(0);
              expect(
                (await bendToken.balanceOf(newUser)).add(oldUserWithdran)
              ).to.be.equal(oldLockedBefore.amount.add(newLockedBefore.amount));
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });

    it("transfer new beneficiary during unlock", async () => {
      await fc.assert(
        fc
          .asyncProperty(
            fc.nat(YEAR),
            fc.nat(10),
            async (timePassed, oldIndex) => {
              await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

              let newIndex = 11;

              let oldUser = beneficiaries[oldIndex].address;

              let newUser = users[newIndex].address;

              let oldLockedBefore = await lockupBend.locks(oldUser);
              let newLockedBefore = await lockupBend.locks(newUser);

              let oldUserBalanceBefore = await bendToken.balanceOf(oldUser);
              await lockupBend.transferBeneficiary(oldUser, newUser);
              let oldUserBalanceAfter = await bendToken.balanceOf(oldUser);
              let oldUserWithdran =
                oldUserBalanceAfter.sub(oldUserBalanceBefore);
              let oldLockedAfter = await lockupBend.locks(oldUser);
              let newLockedAfter = await lockupBend.locks(newUser);

              expect(newLockedBefore.amount).to.be.equal(0);
              expect(newLockedBefore.slope).to.be.equal(0);
              expect(oldLockedAfter.amount).to.be.equal(0);
              expect(oldLockedAfter.slope).to.be.equal(0);

              expect(newLockedAfter.amount.add(oldUserWithdran)).to.be.equal(
                oldLockedBefore.amount
              );

              expect(newLockedAfter.slope).to.be.equal(oldLockedBefore.slope);

              await mineBlockAndIncreaseTime(3 * YEAR - timePassed);

              await lockupBend.connect(users[newIndex]).withdraw();
              expect((await lockupBend.locks(newUser)).amount).to.be.equal(0);
              expect(
                (await bendToken.balanceOf(newUser)).add(oldUserWithdran)
              ).to.be.equal(oldLockedBefore.amount);
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
    it("withdraw after unlocked", async () => {
      await mineBlockAtTime(unlockTime.add(3 * YEAR).toNumber());
      let totalBendAmount = await bendToken.balanceOf(lockupBend.address);
      for (let i = 0; i < 11; i++) {
        let addr = beneficiaries[i].address;
        let locked = await lockupBend.locks(addr);

        await lockupBend.connect(beneficiaries[i]).withdraw();
        let userBalance = await bendToken.balanceOf(addr);
        expect(userBalance).to.be.equal(locked.amount);

        expect((await lockupBend.locks(addr)).amount).to.be.equal(0);
        expect(await lockupBend.lockedAmount(addr)).to.be.equal(0);

        totalBendAmount = totalBendAmount.sub(userBalance);
        expect(await bendToken.balanceOf(lockupBend.address)).to.be.equal(
          totalBendAmount
        );
      }
    });
  });
});

describe("Test LockupBendV2 upgrade", () => {
  it("check storage after upgrade", async () => {
    let addresses = await ethers.getSigners();
    let [deployer, bendCollector] = addresses;

    let users = addresses.slice(2, addresses.length);

    let bendToken = await deployBendTokenTester(deployer, makeBN18(10 ** 8));
    let WETH = await deployContract("WETH9Tester");
    await deployer.sendTransaction({
      to: WETH.address,
      value: makeBN18(1000000000),
    });
    let bToken = await deployContract("BTokenTester", [
      "bToken",
      "bToken",
      WETH.address,
    ]);

    await WETH.connect(bendCollector).approve(
      bToken.address,
      constants.MaxUint256
    );
    let lendPoolAddressesProvider = await deployContract(
      "LendPoolAddressesProviderTester",
      [bToken.address, WETH.address]
    );
    let vebend = await deployVeBend(bendToken);
    let feeDistributor = await deployFeeDistributor(
      lendPoolAddressesProvider,
      vebend,
      WETH,
      bendCollector.address,
      bToken
    );

    await bToken
      .connect(bendCollector)
      .approve(feeDistributor.address, constants.MaxUint256);

    let delegateRegistry = await deployContract("DelegateRegistry");

    let proxy = await deployLockupBendFactory(
      WETH,
      bendToken,
      vebend,
      feeDistributor,
      delegateRegistry
    );
    let preWETH = await proxy.WETH();
    let preBendToken = await proxy.bendToken();
    let preVeBend = await proxy.veBend();
    let preFeeDistributor = await proxy.feeDistributor();
    let preSnapshotDelegation = await proxy.snapshotDelegation();

    let preImplAddress = await upgrades.erc1967.getImplementationAddress(
      proxy.address
    );
    let newProxy = await upgrades.upgradeProxy(
      proxy.address,
      await ethers.getContractFactory("LockupBendV2")
    );
    let newImplAddress = await upgrades.erc1967.getImplementationAddress(
      proxy.address
    );
    expect(proxy.address).to.be.equal(newProxy.address);
    expect(preImplAddress).not.to.be.equal(newImplAddress);
    expect(preWETH.address).to.be.equal(await newProxy.WETH().address);
    expect(preBendToken.address).to.be.equal(
      (await newProxy.bendToken()).address
    );
    expect(preVeBend.address).to.be.equal((await newProxy.veBend()).address);
    expect(preFeeDistributor.address).to.be.equal(
      (await newProxy.feeDistributor()).address
    );
    expect(preSnapshotDelegation.address).to.be.equal(
      await newProxy.snapshotDelegation().address
    );

    expect(await newProxy.unlockStartTime()).to.be.equal(0);
    expect(await newProxy.lockEndTime()).to.be.equal(0);
  });
});
