import hre from "hardhat";
import { assert } from "chai";

import { ethers, ContractTransaction, BigNumber } from "ethers";

export function makeBN(num: string | number, precision: number = 0) {
  return ethers.utils.parseUnits(num.toString(), precision);
}

export function makeBN18(num: string | number) {
  return ethers.utils.parseUnits(num.toString(), 18);
}
export const timeLatest = async () => {
  const block = await lastestBlock();
  return makeBN(parseInt(block.timestamp));
};

export async function timeAtBlock(blockNumber?: number) {
  if (!blockNumber) {
    throw new Error("No block number passed");
  }
  const block = await getBlock(blockNumber);
  return makeBN(parseInt(block.timestamp));
}

export async function mineBlockAndIncreaseTime(seconds: number) {
  await hre.ethers.provider.send("evm_mine", []);
  await hre.ethers.provider.send("evm_increaseTime", [seconds]);
}

export async function increaseTime(seconds: number) {
  await hre.ethers.provider.send("evm_increaseTime", [seconds]);
}

export async function mineBlockAtTime(timestamp: number) {
  await hre.ethers.provider.send("evm_mine", [timestamp]);
}

export async function mineBlock() {
  await hre.ethers.provider.send("evm_mine", []);
}

export async function mineBlockToHeight(target: number) {
  const currentBlock = await latestBlockNum();
  const start = Date.now();
  let notified;
  if (target < currentBlock)
    throw Error(
      `Target block #(${target}) is lower than current block #(${currentBlock})`
    );
  while ((await latestBlockNum()) < target) {
    if (!notified && Date.now() - start >= 5000) {
      notified = true;
      console.log(
        `mineBlockToHeight: Advancing too many blocks is causing this test to be slow.'`
      );
    }
    await mineBlock();
  }
}

export async function waitForTx(tx: ContractTransaction) {
  return await tx.wait();
}

export async function lastestBlock() {
  return await getBlock("latest");
}

// hre.ethers.provider.getBlock not work for evm_snapshot, evm_revert
export async function getBlock(block_number: string | number) {
  if (typeof block_number == "number") {
    block_number = "0x" + block_number.toString(16);
  }
  return await hre.ethers.provider.send("eth_getBlockByNumber", [
    block_number,
    false,
  ]);
}

export async function latestBlockNum() {
  return parseInt((await lastestBlock()).number);
}

export function getDifference(x: BigNumber, y: BigNumber) {
  return Number(x.sub(y).abs());
}
export function assertAlmostEqual(x: BigNumber, y: BigNumber, error = 1000) {
  assert.isAtMost(getDifference(x, y), error);
}

export const evmSnapshot = async () => {
  return await hre.ethers.provider.send("evm_snapshot", []);
};

export const evmRevert = async (id: string) => {
  return await hre.ethers.provider.send("evm_revert", [id]);
};
