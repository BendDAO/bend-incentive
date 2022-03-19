import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract, constants } from "ethers";
import { waitForTx } from "./utils";
import { ONE_YEAR } from "./constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export async function deployBendToken(
  misc: SignerWithAddress,
  amount: BigNumber
) {
  return deployProxyContract("BendToken", [misc.address, amount]);
}

export async function deployBendTokenTester(
  misc: SignerWithAddress,
  amount: BigNumber
) {
  return await deployProxyContract("BendTokenTester", [misc.address, amount]);
}

export async function deployVault(bendToken: Contract) {
  return await deployProxyContract("Vault", [bendToken.address]);
}

export async function deployIncentivesController(
  bendToken: Contract,
  vault: Contract
) {
  const incentivesController = await deployProxyContract(
    "BendProtocolIncentivesController",
    [bendToken.address, vault.address]
  );
  await waitForTx(
    await vault.approve(incentivesController.address, constants.MaxUint256)
  );
  return incentivesController;
}

export async function deployVeBend(bendToken: Contract) {
  return await deployProxyContract("VeBend", [bendToken.address]);
}

export async function deployFeeDistributor(
  lendPoolAddressesProvider: Contract,
  vebend: Contract,
  weth: Contract,
  bendCollector: string,
  bToken: Contract
) {
  return await deployProxyContract("FeeDistributorTester", [
    weth.address,
    bToken.address,
    vebend.address,
    lendPoolAddressesProvider.address,
    bendCollector,
  ]);
}

export async function deployLockupBend(
  weth: Contract,
  bendToken: Contract,
  vebend: Contract,
  feeDistributor: Contract,
  delegation: Contract
) {
  return await deployContract("LockupBend", [
    weth.address,
    bendToken.address,
    vebend.address,
    feeDistributor.address,
    delegation.address,
  ]);
}

export async function deployMerkleDistributor(bendToken: Contract) {
  return await deployProxyContract("MerkleDistributor", [bendToken.address]);
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
