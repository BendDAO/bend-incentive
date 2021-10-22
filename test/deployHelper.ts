import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber, Contract } from "ethers";
import { waitForTx } from "./utils";
import {
  ZERO_ADDRESS,
  STAKED_TOKEN_NAME,
  STAKED_TOKEN_SYMBOL,
  STAKED_TOKEN_DECIMALS,
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  MAX_UINT_AMOUNT,
  ONE_YEAR,
} from "./constants";

export async function deployBendToken() {
  return deployProxyContract("BendToken");
}

export async function deployBendTokenTester() {
  return deployProxyContract("BendTokenTester");
}

export async function deployDoubleTransferHelper(token: string) {
  return deployContract("DoubleTransferHelper", [token]);
}

export async function deployStakedToken(
  vaultOfRewards: Signer,
  bendAmountOfvault: BigNumber,
  emissionManager: Signer
) {
  const bendToken = await deployBendTokenTester();
  await waitForTx(
    await bendToken.mint(
      await vaultOfRewards.getAddress(),
      bendAmountOfvault.toString()
    )
  );
  const stakedToken = await deployProxyContract("StakedTokenTester", [
    bendToken.address,
    bendToken.address,
    COOLDOWN_SECONDS,
    UNSTAKE_WINDOW,
    await vaultOfRewards.getAddress(),
    await emissionManager.getAddress(),
    ONE_YEAR * 100,
    STAKED_TOKEN_NAME,
    STAKED_TOKEN_SYMBOL,
    STAKED_TOKEN_DECIMALS,
    ZERO_ADDRESS,
  ]);
  await waitForTx(
    await bendToken
      .connect(vaultOfRewards)
      .approve(stakedToken.address, MAX_UINT_AMOUNT)
  );
  return {
    bendToken,
    stakedToken,
  };
}

export async function deployIncentivesController(
  bendToken: Contract,
  stakedToken: Contract,
  vaultOfRewards: Signer,
  emissionManager: Signer
) {
  const incentivesController = await deployProxyContract(
    "StakedTokenIncentivesController",
    [
      stakedToken.address,
      await vaultOfRewards.getAddress(),
      await emissionManager.getAddress(),
      ONE_YEAR * 100,
    ]
  );
  await waitForTx(
    await bendToken
      .connect(vaultOfRewards)
      .approve(incentivesController.address, MAX_UINT_AMOUNT)
  );
  return incentivesController;
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
