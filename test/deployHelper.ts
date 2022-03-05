import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { waitForTx } from "./utils";
import { MAX_UINT_AMOUNT, ONE_YEAR } from "./constants";

export async function deployBendToken(vault: Contract, amount: BigNumber) {
  return deployProxyContract("BendToken", [vault.address, amount]);
}

export async function deployBendTokenTester(
  vault: Contract,
  amount: BigNumber
) {
  return deployProxyContract("BendTokenTester", [vault.address, amount]);
}

export async function deployVault() {
  return await deployContract("Vault");
}

export async function deployIncentivesController(
  bendToken: Contract,
  vault: Contract
) {
  const incentivesController = await deployProxyContract(
    "BendProtocolIncentivesController",
    [bendToken.address, vault.address, ONE_YEAR * 100]
  );
  await waitForTx(
    await vault.approve(
      bendToken.address,
      incentivesController.address,
      MAX_UINT_AMOUNT
    )
  );
  return incentivesController;
}

export async function deployMerkleDistributor(bendToken: Contract) {
  return deployProxyContract("MerkleDistributor", [bendToken.address]);
}

export async function deployProxyContract(name: string, args?: unknown[]) {
  const _f = await ethers.getContractFactory(name);
  const _c = await upgrades.deployProxy(_f, args);
  await _c.deployed();

  return _c;
}

export async function deployContract(name: string, args: unknown[] = []) {
  const _f = await ethers.getContractFactory(name);
  const _c = await _f.deploy(...args);
  await _c.deployed();
  return _c;
}
