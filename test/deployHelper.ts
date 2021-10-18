import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { waitForTx } from "./utils";
import {
  ZERO_ADDRESS,
  STAKED_TOKEN_NAME,
  STAKED_TOKEN_SYMBOL,
  STAKED_TOKEN_DECIMALS,
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  MAX_UINT_AMOUNT,
} from "./constants";

export async function deployBendToken() {
  return deployProxyContract("BendToken");
}

export async function deployBendTokenTester() {
  return deployProxyContract("BendTokenTester");
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
    3153600000,
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

export async function deployProxyContract(name: string, args?: unknown[]) {
  const _f = await ethers.getContractFactory(name);
  const _c = await upgrades.deployProxy(_f, args);
  await _c.deployed();
  return _c;
}
