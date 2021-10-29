import { BigNumber, Contract } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { latestBlock, makeBN } from "../utils";
import hre from "hardhat";
import { deployContract, GovContracts } from "../deployHelper";
export const emptyBalances = async (
  users: SignerWithAddress[],
  govContracts: GovContracts
) => {
  for (let i = 0; i < users.length; i++) {
    const balanceBefore = await govContracts.bendToken
      .connect(users[i])
      .balanceOf(users[i].address);
    await (
      await govContracts.bendToken
        .connect(users[i])
        .transfer(govContracts.vault.address, balanceBefore)
    ).wait();
  }
};

export const setBalance = async (
  user: SignerWithAddress,
  amount: BigNumber,
  govContracts: GovContracts
) => {
  // emptying
  const balanceBefore = await govContracts.bendToken
    .connect(user)
    .balanceOf(user.address);
  await (
    await govContracts.bendToken
      .connect(user)
      .transfer(govContracts.vault.address, balanceBefore)
  ).wait();
  // filling
  await (
    await govContracts.vault.transfer(
      govContracts.bendToken.address,
      user.address,
      amount
    )
  ).wait();
};

export const getInitContractData = async (govContracts: GovContracts) => ({
  votingDelay: await govContracts.governance.getVotingDelay(),
  votingDuration: await govContracts.executor.VOTING_DURATION(),
  executionDelay: await govContracts.executor.getDelay(),
  minimumPower: await govContracts.executor.getMinimumVotingPowerNeeded(
    await govContracts.governanceStrategy.getTotalVotingSupplyAt(
      await latestBlock()
    )
  ),
  minimumCreatePower:
    await govContracts.executor.getMinimumPropositionPowerNeeded(
      govContracts.governance.address,
      await hre.ethers.provider.getBlockNumber()
    ),
  gracePeriod: await govContracts.executor.GRACE_PERIOD(),
});

export const expectProposalState = async (
  proposalId: BigNumber,
  state: number,
  govContracts: GovContracts
) => {
  expect(
    await govContracts.governance.getProposalState(proposalId)
  ).to.be.equal(state);
};

export const getLastProposalId = async (govContracts: GovContracts) => {
  const currentCount = await govContracts.governance.getProposalsCount();
  return currentCount.eq("0") ? currentCount : currentCount.sub("1");
};

export const encodeSetDelay = async (
  newDelay: number,
  govContracts: GovContracts
) =>
  govContracts.governance.interface.encodeFunctionData("setVotingDelay", [
    makeBN(newDelay),
  ]);

export const impersonateAccountsHardhat = async (accounts: string[]) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const account of accounts) {
    // eslint-disable-next-line no-await-in-loop
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [account],
    });
    // Send ether to the impersonated address, which is a non payable contract via selfdestruct
    const selfDestructContract = await deployContract("SelfdestructTransfer");
    await (
      await selfDestructContract.destroyAndTransfer(account, {
        value: hre.ethers.utils.parseEther("1"),
      })
    ).wait();
  }
};
