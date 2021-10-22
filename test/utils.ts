import hre from "hardhat";
import { assert, expect } from "chai";

import { ethers, ContractTransaction, BigNumber, Event } from "ethers";

export function makeBN(num: string | number, precision: number = 0) {
  return ethers.utils.parseUnits(num.toString(), precision);
}

export function makeBN18(num: string | number) {
  return ethers.utils.parseUnits(num.toString(), 18);
}
export const timeLatest = async () => {
  const block = await hre.ethers.provider.getBlock("latest");
  return makeBN(block.timestamp);
};

export async function getBlockTimestamp(blockNumber?: number) {
  if (!blockNumber) {
    throw new Error("No block number passed");
  }
  const block = await hre.ethers.provider.getBlock(blockNumber);
  return makeBN(block.timestamp);
}

export async function fastForwardTimeAndBlock(seconds: number) {
  await hre.ethers.provider.send("evm_increaseTime", [seconds]);
  await hre.ethers.provider.send("evm_mine", []);
}

export async function fastForwardTime(seconds: number) {
  await hre.ethers.provider.send("evm_increaseTime", [seconds]);
  await hre.ethers.provider.send("evm_mine", []);
}

export async function fastForwardBlock(timestamp?: number) {
  const priorBlock = await getCurrentBlock();
  await hre.ethers.provider.send("evm_mine", timestamp ? [timestamp] : []);
  const nextBlock = await getCurrentBlock();
  if (!timestamp && nextBlock == priorBlock) {
    await fastForwardBlock();
    return;
  }
}

export async function waitForTx(tx: ContractTransaction) {
  return await tx.wait();
}

export async function getCurrentBlock() {
  return hre.ethers.provider.getBlockNumber();
}

export function getDifference(x: BigNumber, y: BigNumber) {
  return Number(x.sub(y).abs());
}
export function assertAlmostEqual(x: BigNumber, y: BigNumber, error = 1000) {
  assert.isAtMost(getDifference(x, y), error);
}
