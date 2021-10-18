import {
  ethers,
  ContractTransaction,
  Contract,
  BigNumberish,
  BigNumber,
} from "ethers";
import { expect, assert } from "chai";
import { waitForTx, fastForwardTime, makeBN } from "./utils";
import { signTypedData, SignTypedDataVersion } from "@metamask/eth-sig-util";
import { fromRpcSig, ECDSASignature } from "ethereumjs-util";
export const buildPermitParams = (
  chainId: number,
  tokenContract: string,
  tokenName: string,
  owner: string,
  spender: string,
  nonce: number,
  deadline: string,
  value: BigNumber | number
) => ({
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit" as const,
  domain: {
    name: tokenName,
    version: "1",
    chainId: chainId,
    verifyingContract: tokenContract,
  },
  message: {
    owner,
    spender,
    value: value.toString(),
    nonce,
    deadline,
  },
});

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
  actions: () => Promise<ContractTransaction>[],
  shouldReward?: boolean,
  assetConfig?: AssetConfig
) {
  const underlyingAsset = stakedToken.address;
  // To prevent coverage to fail, add 5 seconds per comparisson.
  // await fastForwardTime(5);
  const rewardsBalanceBefore = await await stakedToken.getTotalRewardsBalance(
    userAddress
  );
  // Configure assets of stake token
  const assetConfiguration = assetConfig
    ? {
        ...assetConfig,
        underlyingAsset,
      }
    : {
        emissionPerSecond: "100",
        totalStaked: await stakedToken.totalSupply(),
        underlyingAsset,
      };
  await stakedToken.configureAssets([assetConfiguration]);
  const userBalance = await stakedToken.balanceOf(userAddress);
  // Get index before actions
  const userIndexBefore = await getUserIndex(
    stakedToken,
    userAddress,
    underlyingAsset
  );
  // Dispatch actions that can or not update the user index
  const receipts: ethers.ContractReceipt[] = await Promise.all(
    actions().map(async (action) => waitForTx(await action))
  );

  // Get index after actions
  const userIndexAfter = await getUserIndex(
    stakedToken,
    userAddress,
    underlyingAsset
  );
  // Compare calculated JS rewards versus Solidity user rewards
  const rewardsBalanceAfter = await await stakedToken.getTotalRewardsBalance(
    userAddress
  );

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
