import { ethers, upgrades } from "hardhat";
import { expect } from "chai";

import { Contract, BigNumber, constants } from "ethers";
import {
  deployBendTokenTester,
  deployContract,
  deployFeeDistributor,
  deployLockupBendFactory,
  deployLockupBendV2,
  deployProxyContract,
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

describe("BeneficiaryProxy tests", () => {
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
  let proxy: Contract;
  let beneficiary: string;
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
    proxy = await deployProxyContract("BeneficiaryProxy", [
      lockupBend.address,
      bendToken.address,
    ]);
    beneficiary = users[11].address;
    proxy.setBeneficiary(beneficiary);
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

    it("withdraw by proxy", async () => {
      await fc.assert(
        fc
          .asyncProperty(
            fc.nat(YEAR),
            fc.nat(10),
            async (timePassed, oldIndex) => {
              await mineBlockAtTime(unlockTime.add(timePassed).toNumber());

              let oldUser = beneficiaries[oldIndex].address;

              let newUser = proxy.address;

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
              await proxy.withdraw();
              expect((await lockupBend.locks(newUser)).amount).to.be.equal(0);
              expect(await bendToken.balanceOf(newUser)).to.be.equal(0);
              expect(
                (await bendToken.balanceOf(beneficiary)).add(oldUserWithdran)
              ).to.be.equal(oldLockedBefore.amount);
            }
          )
          .beforeEach(async () => {
            await snapshots.revert("createLock");
          })
      );
    });
  });
});
