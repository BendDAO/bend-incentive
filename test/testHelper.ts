import {
  ethers,
  ContractTransaction,
  Contract,
  BigNumberish,
  BigNumber,
} from "ethers";
import { expect } from "chai";
import {
  waitForTx,
  makeBN,
  timeAtBlock,
  mineBlockAndIncreaseTime,
} from "./utils";
import { signTypedData, SignTypedDataVersion } from "@metamask/eth-sig-util";
import { fromRpcSig, ECDSASignature } from "ethereumjs-util";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const getSignatureFromTypedData = (
  privateKey: string,
  typedData: any
): ECDSASignature => {
  const signature = signTypedData({
    privateKey: Buffer.from(privateKey.substring(2, 66), "hex"),
    data: typedData,
    version: SignTypedDataVersion.V4,
  });
  return fromRpcSig(signature);
};

type AssetConfig = {
  totalStaked: BigNumberish;
  emissionPerSecond: BigNumberish;
};

export async function compareRewardsAtAction(
  stakedToken: Contract,
  userAddress: string,
  action: () => Promise<void>,
  shouldReward: boolean,
  emissionPerSecond?: number
) {
  if (emissionPerSecond) {
    await stakedToken.configure(emissionPerSecond);
  }
  await stakedToken.updateCurrentUnclaimedRewards([userAddress]);
  const underlyingAsset = stakedToken.address;
  const rewardsBalanceBefore = await stakedToken.claimableRewards(userAddress);
  const userBalance = await stakedToken.balanceOf(userAddress);
  // Get index before actions
  const userIndexBefore = await getUserIndex(
    stakedToken,
    userAddress,
    underlyingAsset
  );

  await action();

  // Get index after actions
  const userIndexAfter = await getUserIndex(
    stakedToken,
    userAddress,
    underlyingAsset
  );
  // Compare calculated JS rewards versus Solidity user rewards
  const rewardsBalanceAfter = await stakedToken.claimableRewards(userAddress);

  const expectedAccruedRewards = getRewards(
    userBalance,
    userIndexAfter,
    userIndexBefore
  );

  expect(rewardsBalanceAfter).to.eq(
    rewardsBalanceBefore.add(expectedAccruedRewards)
  );
  // Explicit check rewards when the test case expects rewards to the user
  if (shouldReward) {
    expect(expectedAccruedRewards).to.be.gt(0);
  } else {
    expect(expectedAccruedRewards).to.be.eq(0);
    expect(rewardsBalanceAfter).to.be.eq(rewardsBalanceBefore);
  }
}

export function getRewards(
  balance: BigNumber,
  assetIndex: BigNumber,
  userIndex: BigNumber,
  precision: number = 18
) {
  return balance.mul(assetIndex.sub(userIndex)).div(makeBN(1, precision));
}

export async function getUserIndex(
  distributionManager: Contract,
  user: string,
  asset: string
) {
  return await distributionManager.getUserAssetData(user, asset);
}

export async function getAssetsData(
  distributionManager: Contract,
  underlyingAssets: string[]
) {
  return await Promise.all(
    underlyingAssets.map(async (underlyingAsset) => ({
      ...(await distributionManager.assets(underlyingAsset)),
      underlyingAsset,
    }))
  );
}

export async function compareRewardsAtTransfer(
  stakedToken: Contract,
  from: SignerWithAddress,
  to: SignerWithAddress,
  amount: BigNumberish,
  fromShouldReward: boolean,
  toShouldReward: boolean,
  emissionPerSecond?: number
) {
  const fromAddress = from.address;
  const toAddress = to.address;
  const underlyingAsset = stakedToken.address;
  if (emissionPerSecond) {
    await stakedToken.configure(emissionPerSecond);
  }

  const fromSavedBalance = await stakedToken.balanceOf(fromAddress);
  const toSavedBalance = await stakedToken.balanceOf(toAddress);

  await stakedToken.updateCurrentUnclaimedRewards([from.address, to.address]);
  const fromRewardsBalanceBefore = await stakedToken.claimableRewards(
    fromAddress
  );
  const toRewardsBalanceBefore = await stakedToken.claimableRewards(toAddress);
  // Get index before actions
  const fromIndexBefore = await getUserIndex(
    stakedToken,
    fromAddress,
    underlyingAsset
  );
  const toIndexBefore = await getUserIndex(
    stakedToken,
    toAddress,
    underlyingAsset
  );

  // Load actions that can or not update the user index
  await waitForTx(await stakedToken.connect(from).transfer(toAddress, amount));
  // Check rewards after transfer

  // Get index after actions
  const fromIndexAfter = await getUserIndex(
    stakedToken,
    fromAddress,
    underlyingAsset
  );
  const toIndexAfter = await getUserIndex(
    stakedToken,
    toAddress,
    underlyingAsset
  );

  // FROM: Compare calculated JS rewards versus Solidity user rewards
  const fromRewardsBalanceAfter = await stakedToken.claimableRewards(
    fromAddress
  );
  const fromExpectedAccruedRewards = getRewards(
    fromSavedBalance,
    fromIndexAfter,
    fromIndexBefore
  );

  expect(fromRewardsBalanceAfter).to.eq(
    fromRewardsBalanceBefore.add(fromExpectedAccruedRewards)
  );

  // TO: Compare calculated JS rewards versus Solidity user rewards
  const toRewardsBalanceAfter = await stakedToken.claimableRewards(toAddress);
  const toExpectedAccruedRewards = getRewards(
    toSavedBalance,
    toIndexAfter,
    toIndexBefore
  );
  expect(toRewardsBalanceAfter).to.eq(
    toRewardsBalanceBefore.add(toExpectedAccruedRewards)
  );

  // Explicit check rewards when the test case expects rewards to the user
  if (fromShouldReward) {
    expect(fromExpectedAccruedRewards).to.be.gt(0);
  } else {
    expect(fromExpectedAccruedRewards).to.be.eq(0);
  }

  // Explicit check rewards when the test case expects rewards to the user
  if (toShouldReward) {
    expect(toExpectedAccruedRewards).to.be.gt(0);
  } else {
    expect(toExpectedAccruedRewards).to.be.eq(0);
  }

  // Expect new balances
  if (fromAddress === toAddress) {
    expect(fromSavedBalance).to.be.eq(toSavedBalance);
  } else {
    const fromNewBalance = await stakedToken.balanceOf(fromAddress);
    const toNewBalance = await stakedToken.balanceOf(toAddress);
    expect(fromNewBalance).to.be.eq(fromSavedBalance.sub(amount));
    expect(toNewBalance).to.be.eq(toSavedBalance.add(amount));
  }
}

export async function compareAssetIndex(
  emissionPerSecond: number,
  distributionManager: Contract,
  asset: Contract,
  userAddress: string,
  totalSupply: number,
  userBalance: number,
  action: () => Promise<ContractTransaction>
) {
  const underlyingAsset = asset.address;
  let tx = await distributionManager.configureAssets(
    [underlyingAsset],
    [emissionPerSecond]
  );
  let txReceipt = await waitForTx(tx);
  let txTimestamp = await timeAtBlock(txReceipt.blockNumber);
  const distributionEndTimestamp = await distributionManager.DISTRIBUTION_END();
  const rewardsBalanceBefore =
    await distributionManager.getUserUnclaimedRewards(userAddress);
  const userIndexBefore = await getUserIndex(
    distributionManager,
    userAddress,
    underlyingAsset
  );
  const assetDataBefore = await distributionManager.assets(underlyingAsset);
  tx = await action();
  txReceipt = await waitForTx(tx);
  txTimestamp = await timeAtBlock(txReceipt.blockNumber);
  const userIndexAfter = await getUserIndex(
    distributionManager,
    userAddress,
    underlyingAsset
  );
  const assetDataAfter = await distributionManager.assets(underlyingAsset);

  const rewardsBalanceAfter = await distributionManager.getUserUnclaimedRewards(
    userAddress
  );

  expect(assetDataAfter.emissionPerSecond).to.eq(
    assetDataBefore.emissionPerSecond
  );
  expect(assetDataAfter.lastUpdateTimestamp).to.eq(txTimestamp);
  expect(assetDataAfter.index).to.eq(
    getNormalizedDistribution(
      makeBN(totalSupply),
      assetDataBefore.index,
      assetDataBefore.emissionPerSecond,
      assetDataBefore.lastUpdateTimestamp,
      txTimestamp,
      distributionEndTimestamp
    )
  );
  expect(userIndexAfter).to.be.equal(
    assetDataAfter.index,
    "user index are not correctly updated"
  );
  if (emissionPerSecond == 0) {
    expect(userIndexBefore).to.be.equal(
      userIndexAfter,
      "userIndexAfter should not change"
    );
    expect((txReceipt.events || []).length).to.be.equal(
      0,
      "no events should be emitted"
    );
  } else {
    expect(assetDataAfter.index).to.not.eq(assetDataBefore.index);
    expect(tx)
      .to.emit(distributionManager, "AssetIndexUpdated")
      .withArgs(underlyingAsset, assetDataAfter.index);

    expect(tx)
      .to.emit(distributionManager, "UserIndexUpdated")
      .withArgs(userAddress, underlyingAsset, assetDataAfter.index);
  }
  const expectedAccruedRewards = getRewards(
    makeBN(userBalance),
    userIndexAfter,
    userIndexBefore
  );

  expect(rewardsBalanceAfter).to.be.equal(
    rewardsBalanceBefore.add(expectedAccruedRewards),
    "rewards balance are incorrect"
  );
  if (!expectedAccruedRewards.eq(0)) {
    expect(tx)
      .to.emit(distributionManager, "RewardsAccrued")
      .withArgs(userAddress, expectedAccruedRewards);
  }
}
export function getLinearCumulatedRewards(
  emissionPerSecond: BigNumber,
  lastUpdateTimestamp: BigNumber,
  currentTimestamp: BigNumber
): BigNumber {
  const timeDelta = currentTimestamp.sub(lastUpdateTimestamp);
  return timeDelta.mul(emissionPerSecond);
}

export function getNormalizedDistribution(
  balance: BigNumber,
  oldIndex: BigNumber,
  emissionPerSecond: BigNumber,
  lastUpdateTimestamp: BigNumber,
  currentTimestamp: BigNumber,
  emissionEndTimestamp: BigNumber,
  precision: number = 18
): BigNumber {
  if (balance.eq(0) || lastUpdateTimestamp.gte(emissionEndTimestamp)) {
    return oldIndex;
  }
  const linearReward = getLinearCumulatedRewards(
    emissionPerSecond,
    lastUpdateTimestamp,
    currentTimestamp.gte(emissionEndTimestamp)
      ? emissionEndTimestamp
      : currentTimestamp
  );

  return linearReward.mul(makeBN(10).pow(precision)).div(balance).add(oldIndex);
}
