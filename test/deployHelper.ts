import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import { waitForTx } from "./utils";
import { ZERO_ADDRESS } from "./constants";
import BN from "bn.js";

export async function deployBendToken() {
  return deployProxyContract("BendToken");
}

export async function deployBendTokenTester() {
  return deployProxyContract("BendTokenTester");
}

export async function deployStakedToken(
  vaultOfRewards: Signer,
  bendAmountOfvault: BN,
  emissionManager: Signer
) {
  const bendToken = await deployBendTokenTester();
  await waitForTx(
    await bendToken.mint(
      await vaultOfRewards.getAddress(),
      bendAmountOfvault.toString()
    )
  );
  return deployProxyContract("StakedToken", [
    bendToken.address,
    bendToken.address,
    864000,
    172800,
    await vaultOfRewards.getAddress(),
    await emissionManager.getAddress(),
    3153600000,
    "Staked BEND",
    "stkBEND",
    18,
    ZERO_ADDRESS,
  ]);
}

export async function deployProxyContract(name: string, args?: unknown[]) {
  const _f = await ethers.getContractFactory(name);
  const _c = await upgrades.deployProxy(_f, args);
  await _c.deployed();
  return _c;
}
