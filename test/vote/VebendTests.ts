import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { Contract, BigNumber, constants } from "ethers";

import {
  deployBendTokenTester,
  deployVeBend,
  deployVault,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  makeBN,
  makeBN18,
  timeLatest,
  mineBlockAtTime,
  mineBlockAndIncreaseTime,
  increaseTime,
  latestBlockNum,
  assertAlmostEqualTol,
} from "../utils";

import { forEach } from "p-iteration";

const H = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const MAXTIME = 126144000;
const TOL = 120 / WEEK;

describe("VeBend tests", function () {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let vault: Contract;
  let token: Contract;
  let vebend: Contract;

  before(async () => {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    vault = await deployVault();
    token = await deployBendTokenTester(vault, makeBN18(1000000));
  });

  describe("#", () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let amount: BigNumber;
    let stages: Map<string, [Number, Number][]>;

    function computeVeBendAmount(lockTime: number) {
      lockTime = Math.max(lockTime, 0);
      return amount.div(MAXTIME).mul(lockTime);
    }

    async function moveToNextWeek() {
      let now = await timeLatest();
      let nextWeek = now.div(WEEK).add(1).mul(WEEK);
      let dt = nextWeek.sub(now);
      await mineBlockAndIncreaseTime(dt.toNumber());
      return nextWeek;
    }
    before(async () => {
      vebend = await deployVeBend(token);
      [alice, bob] = users;
      stages = new Map();
    });

    it("before deposits", async () => {
      let amount = makeBN18(10000);
      await token.setBalance(alice.address, amount);
      await token.setBalance(bob.address, amount);
      await token.connect(alice).approve(vebend.address, amount.mul(10));
      await token.connect(bob).approve(vebend.address, amount.mul(10));
      // Move to timing which is good for testing - beginning of a UTC week
      let time = await moveToNextWeek();

      let blockNum = await latestBlockNum();
      stages.set("before_deposits", [[blockNum, time.toNumber()]]);

      expect(await vebend["totalSupply()"]()).to.be.equal(
        0,
        "vebend total supply should be zero"
      );
      expect(await vebend["balanceOf(address)"](alice.address)).to.be.equal(
        0,
        "alice vebend balance should be zero"
      );
      expect(await vebend["balanceOf(address)"](bob.address)).to.be.equal(
        0,
        "bob vebend balance should be zero"
      );
    });

    it("alice deposit", async () => {
      amount = makeBN18(10000);
      let time = await timeLatest();
      await increaseTime(H);
      await vebend.connect(alice).createLock(amount, time.add(WEEK));
      let blockNum = await latestBlockNum();
      let blockTime = (await timeLatest()).toNumber();
      stages.set("alice_deposit", [[blockNum, blockTime]]);
      expect(await token.balanceOf(alice.address)).to.be.equal(
        0,
        "alice bend balance should be zero after lock"
      );
      await mineBlockAndIncreaseTime(H);

      let veBendAmount = computeVeBendAmount(WEEK - 2 * H);
      let totalSupply = await vebend["totalSupply()"]();
      let aliceBalance = await vebend["balanceOf(address)"](alice.address);
      let bobBalance = await vebend["balanceOf(address)"](bob.address);
      assertAlmostEqualTol(totalSupply, veBendAmount, TOL);
      assertAlmostEqualTol(aliceBalance, veBendAmount, TOL);
      expect(totalSupply).to.be.equal(aliceBalance);
      expect(bobBalance).to.be.equal(0);
    });
    it("alice unlock", async () => {
      let t0 = await timeLatest();
      let blockNum = await latestBlockNum();
      stages.set("alice_unlock", [[blockNum, t0.toNumber()]]);
      for (let i = 0; i < 7; i++) {
        for (let i = 0; i < 24; i++) {
          await mineBlockAndIncreaseTime(H);
        }
        let dt = (await timeLatest()).sub(t0).toNumber();
        let veBendAmount = computeVeBendAmount(WEEK - 2 * H - dt);
        let totalSupply = await vebend["totalSupply()"]();
        let aliceBalance = await vebend["balanceOf(address)"](alice.address);
        let bobBalance = await vebend["balanceOf(address)"](bob.address);
        assertAlmostEqualTol(totalSupply, veBendAmount, TOL);
        assertAlmostEqualTol(aliceBalance, veBendAmount, TOL);
        expect(totalSupply).to.be.equal(aliceBalance);
        expect(bobBalance).to.be.equal(0);

        let blockNum = await latestBlockNum();
        let blockTime = (await timeLatest()).toNumber();
        stages.get("alice_unlock")?.push([blockNum, blockTime]);
      }
    });
    it("alice withdraw", async () => {
      await increaseTime(H);
      expect(await vebend["balanceOf(address)"](alice.address)).to.be.equal(
        0,
        "alice vebend balance should be zero after expired"
      );
      await vebend.connect(alice).withdraw();

      let blockNum = await latestBlockNum();
      let blockTime = (await timeLatest()).toNumber();
      stages.set("alice_withdraw", [[blockNum, blockTime]]);

      let totalSupply = await vebend["totalSupply()"]();
      let aliceBalance = await vebend["balanceOf(address)"](alice.address);
      let bobBalance = await vebend["balanceOf(address)"](bob.address);

      expect(await token.balanceOf(alice.address)).to.be.equal(amount);
      expect(totalSupply).to.be.equal(0);
      expect(aliceBalance).to.be.equal(0);
      expect(bobBalance).to.be.equal(0);
      await mineBlockAndIncreaseTime(H);
    });
    it("alice deposit 2, bob deposit", async () => {
      let time = await moveToNextWeek();
      await vebend.connect(alice).createLock(amount, time.add(2 * WEEK));
      stages.set("alice_deposit_2", [
        [await latestBlockNum(), time.toNumber()],
      ]);
      let veBendAmount = computeVeBendAmount(2 * WEEK);

      let totalSupply = await vebend["totalSupply()"]();
      let aliceBalance = await vebend["balanceOf(address)"](alice.address);
      let bobBalance = await vebend["balanceOf(address)"](bob.address);

      assertAlmostEqualTol(totalSupply, veBendAmount, TOL);
      expect(totalSupply).to.be.equal(aliceBalance);
      expect(bobBalance).to.be.equal(0);

      time = await timeLatest();
      await vebend.connect(bob).createLock(amount, time.add(WEEK));
      stages.set("bob_deposit", [[await latestBlockNum(), time.toNumber()]]);

      totalSupply = await vebend["totalSupply()"]();
      aliceBalance = await vebend["balanceOf(address)"](alice.address);
      bobBalance = await vebend["balanceOf(address)"](bob.address);

      assertAlmostEqualTol(totalSupply, computeVeBendAmount(3 * WEEK), TOL);
      assertAlmostEqualTol(aliceBalance, computeVeBendAmount(2 * WEEK), TOL);
      assertAlmostEqualTol(bobBalance, computeVeBendAmount(WEEK), TOL);
    });

    it("alice bob unlock", async () => {
      let t0 = await timeLatest();
      await mineBlockAndIncreaseTime(H);
      stages.set("alice_bob_unlock", []);
      for (let i = 0; i < 7; i++) {
        for (let i = 0; i < 24; i++) {
          await mineBlockAndIncreaseTime(H);
        }

        let dt = (await timeLatest()).sub(t0).toNumber();

        let totalSupply = await vebend["totalSupply()"]();
        let aliceBalance = await vebend["balanceOf(address)"](alice.address);
        let bobBalance = await vebend["balanceOf(address)"](bob.address);

        expect(totalSupply).to.be.equal(aliceBalance.add(bobBalance));
        assertAlmostEqualTol(
          aliceBalance,
          computeVeBendAmount(2 * WEEK - dt),
          TOL
        );
        assertAlmostEqualTol(bobBalance, computeVeBendAmount(WEEK - dt), TOL);

        stages
          .get("alice_bob_unlock")
          ?.push([await latestBlockNum(), (await timeLatest()).toNumber()]);
      }
    });

    it("bob withdraw", async () => {
      await mineBlockAndIncreaseTime(H);

      let bobBalance = await vebend["balanceOf(address)"](bob.address);
      expect(bobBalance).to.be.equal(
        0,
        "bob vebend balance should be zero after expired"
      );
      await vebend.connect(bob).withdraw();
      let t0 = await timeLatest();
      stages.set("bob_withdraw", [[await latestBlockNum(), t0.toNumber()]]);

      expect(await token.balanceOf(bob.address)).to.be.equal(amount);

      let totalSupply = await vebend["totalSupply()"]();
      let aliceBalance = await vebend["balanceOf(address)"](alice.address);
      bobBalance = await vebend["balanceOf(address)"](bob.address);

      expect(totalSupply).to.be.equal(aliceBalance);
      assertAlmostEqualTol(totalSupply, computeVeBendAmount(WEEK - 2 * H), TOL);
      expect(bobBalance).to.be.equal(0);
    });

    it("alice unlock 2", async () => {
      let t0 = await timeLatest();
      await mineBlockAndIncreaseTime(H);

      stages.set("alice_unlock_2", []);
      for (let i = 0; i < 7; i++) {
        for (let i = 0; i < 24; i++) {
          await mineBlockAndIncreaseTime(H);
        }
        let dt = (await timeLatest()).sub(t0).toNumber();

        let totalSupply = await vebend["totalSupply()"]();
        let aliceBalance = await vebend["balanceOf(address)"](alice.address);
        let bobBalance = await vebend["balanceOf(address)"](bob.address);

        expect(totalSupply).to.be.equal(aliceBalance);
        assertAlmostEqualTol(
          totalSupply,
          computeVeBendAmount(WEEK - 2 * H - dt),
          TOL
        );
        expect(bobBalance).to.be.equal(0);
        stages
          .get("alice_unlock_2")
          ?.push([await latestBlockNum(), (await timeLatest()).toNumber()]);
      }
    });

    it("alice and bob withdraw 2", async () => {
      let aliceBalance = await vebend["balanceOf(address)"](alice.address);
      expect(aliceBalance).to.be.equal(
        0,
        "alice vebend balance should be zero after expired"
      );
      await vebend.connect(alice).withdraw();
      let t0 = await timeLatest();
      stages.set("alice_withdraw_2", [[await latestBlockNum(), t0.toNumber()]]);

      await mineBlockAndIncreaseTime(H);
      await vebend.connect(bob).withdraw();
      t0 = await timeLatest();
      stages.set("bob_withdraw_2", [[await latestBlockNum(), t0.toNumber()]]);

      let totalSupply = await vebend["totalSupply()"]();
      aliceBalance = await vebend["balanceOf(address)"](alice.address);
      let bobBalance = await vebend["balanceOf(address)"](bob.address);

      expect(await token.balanceOf(alice.address)).to.be.equal(amount);
      expect(await token.balanceOf(bob.address)).to.be.equal(amount);

      expect(totalSupply).to.be.equal(0);
      expect(aliceBalance).to.be.equal(0);
      expect(bobBalance).to.be.equal(0);
    });

    it("balanceOfAt", async () => {
      // @ts-expect-error
      let blockNum = stages.get("before_deposits")[0][0];
      expect(await vebend.balanceOfAt(alice.address, blockNum)).to.be.equal(0);
      expect(await vebend.balanceOfAt(bob.address, blockNum)).to.be.equal(0);
      expect(await vebend.totalSupplyAt(blockNum)).to.be.equal(0);
      // @ts-expect-error
      blockNum = stages.get("alice_deposit")[0][0];
      // @ts-expect-error
      let blockTime = stages.get("alice_deposit")[0][1];

      let aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      let bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
      let totalSupply = await vebend.totalSupplyAt(blockNum);

      assertAlmostEqualTol(aliceBalance, computeVeBendAmount(WEEK - H), TOL);
      expect(bobBalance).to.be.equal(0);
      expect(totalSupply).to.be.equal(aliceBalance);

      await forEach(stages.get("alice_unlock") || [], async (value, index) => {
        let blockNum = value[0];
        let aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
        let bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
        let totalSupply = await vebend.totalSupplyAt(blockNum);

        expect(bobBalance).to.be.equal(0);
        expect(totalSupply).to.be.equal(aliceBalance);

        let time_left = Math.max((WEEK * (7 - index)) / 7 - 2 * H, 0);
        let error_1h = time_left == 0 ? 0 : H / time_left;
        let left_amount = computeVeBendAmount(time_left);
        assertAlmostEqualTol(aliceBalance, left_amount, error_1h);
      });

      // @ts-expect-error
      blockNum = stages.get("alice_withdraw")[0][0];
      totalSupply = await vebend.totalSupplyAt(blockNum);
      aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
      expect(totalSupply).to.be.equal(aliceBalance);
      expect(aliceBalance).to.be.equal(bobBalance);
      expect(bobBalance).to.be.equal(0);

      // @ts-expect-error
      blockNum = stages.get("alice_deposit_2")[0][0];
      totalSupply = await vebend.totalSupplyAt(blockNum);
      aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
      assertAlmostEqualTol(totalSupply, computeVeBendAmount(2 * WEEK), TOL);
      expect(totalSupply).to.be.equal(aliceBalance);
      expect(bobBalance).to.be.equal(0);

      // @ts-expect-error
      blockNum = stages.get("bob_deposit")[0][0];
      totalSupply = await vebend.totalSupplyAt(blockNum);
      aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
      expect(totalSupply).to.be.equal(aliceBalance.add(bobBalance));
      assertAlmostEqualTol(totalSupply, computeVeBendAmount(3 * WEEK), TOL);
      assertAlmostEqualTol(aliceBalance, computeVeBendAmount(2 * WEEK), TOL);

      // @ts-expect-error
      let t0 = stages.get("bob_deposit")[0][1];
      await forEach(
        stages.get("alice_bob_unlock") || [],
        async (value, index) => {
          let blockNum = value[0];
          let blockTime = value[1];
          let totalSupply = await vebend.totalSupplyAt(blockNum);
          let aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
          let bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
          expect(totalSupply).to.be.equal(aliceBalance.add(bobBalance));
          // @ts-expect-error
          let dt = blockTime - t0;

          let error_1h = H / (2 * WEEK - index * DAY);
          assertAlmostEqualTol(
            aliceBalance,
            computeVeBendAmount(2 * WEEK - dt),
            error_1h
          );
          assertAlmostEqualTol(
            bobBalance,
            computeVeBendAmount(WEEK - dt),
            error_1h
          );
        }
      );

      // @ts-expect-error
      blockNum = stages.get("bob_withdraw")[0][0];
      totalSupply = await vebend.totalSupplyAt(blockNum);
      aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      bobBalance = await vebend.balanceOfAt(bob.address, blockNum);
      expect(totalSupply).to.be.equal(aliceBalance);
      assertAlmostEqualTol(totalSupply, computeVeBendAmount(WEEK - 2 * H), TOL);
      expect(bobBalance).to.be.equal(0);

      // @ts-expect-error
      t0 = stages.get("bob_withdraw")[0][1];
      await forEach(
        stages.get("alice_unlock_2") || [],
        async (value, index) => {
          let blockNum = value[0];
          let blockTime = value[1];
          let totalSupply = await vebend.totalSupplyAt(blockNum);
          let aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
          let bobBalance = await vebend.balanceOfAt(bob.address, blockNum);

          expect(totalSupply).to.be.equal(aliceBalance);
          expect(bobBalance).to.be.equal(0);
          // @ts-expect-error
          let dt = blockTime - t0;

          let error_1h = H / (WEEK - index * DAY + DAY);
          assertAlmostEqualTol(
            totalSupply,
            computeVeBendAmount(WEEK - dt - 2 * H),
            error_1h
          );
        }
      );

      // @ts-expect-error
      blockNum = stages.get("bob_withdraw_2")[0][0];
      totalSupply = await vebend.totalSupplyAt(blockNum);
      aliceBalance = await vebend.balanceOfAt(alice.address, blockNum);
      bobBalance = await vebend.balanceOfAt(bob.address, blockNum);

      expect(totalSupply).to.be.equal(aliceBalance);
      expect(aliceBalance).to.be.equal(bobBalance);
      expect(bobBalance).to.be.equal(0);
    });
  });
});
