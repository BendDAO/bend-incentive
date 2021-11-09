import { ethers, upgrades } from "hardhat";
import { Signer, BigNumber, Contract } from "ethers";
import { makeBN, makeBN18, waitForTx } from "./utils";
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
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export async function deployBendToken() {
  return deployProxyContract("BendToken");
}

export async function deployBendTokenTester() {
  return deployProxyContract("BendTokenTester");
}

export async function deployDoubleTransferHelper(token: string) {
  return deployContract("DoubleTransferHelper", [token]);
}

export async function deployVault() {
  return await deployContract("Vault");
}

export async function deployStakedToken(
  vaultOfRewards: Contract,
  bendAmountOfvault: BigNumber,
  emissionManager: string
) {
  const bendToken = await deployBendTokenTester();
  await waitForTx(
    await bendToken.mint(vaultOfRewards.address, bendAmountOfvault.toString())
  );
  const stakedToken = await deployProxyContract("StakedBend", [
    bendToken.address,
    bendToken.address,
    COOLDOWN_SECONDS,
    UNSTAKE_WINDOW,
    vaultOfRewards.address,
    emissionManager,
    ONE_YEAR * 100,
    STAKED_TOKEN_NAME,
    STAKED_TOKEN_SYMBOL,
    STAKED_TOKEN_DECIMALS,
  ]);
  await waitForTx(
    await vaultOfRewards.approve(
      bendToken.address,
      stakedToken.address,
      MAX_UINT_AMOUNT
    )
  );
  return {
    bendToken,
    stakedToken,
  };
}

export async function deployIncentivesController(
  bendToken: Contract,
  stakedToken: Contract,
  vaultOfRewards: Contract,
  emissionManager: string
) {
  const incentivesController = await deployProxyContract(
    "StakedBendIncentivesController",
    [
      stakedToken.address,
      vaultOfRewards.address,
      await emissionManager,
      ONE_YEAR * 100,
    ]
  );
  await waitForTx(
    await vaultOfRewards.approve(
      bendToken.address,
      incentivesController.address,
      MAX_UINT_AMOUNT
    )
  );
  return incentivesController;
}

export async function deployFlashAttacks(
  token: string,
  minter: string,
  governance: string
) {
  return await deployContract("FlashAttacks", [token, minter, governance]);
}

export interface GovContracts {
  deployer: SignerWithAddress;
  guardian: SignerWithAddress;
  users: SignerWithAddress[];
  vault: Contract;
  bendToken: Contract;
  stakedToken: Contract;
  governance: Contract;
  governanceStrategy: Contract;
  executor: Contract;
}

export async function deployGovernanceStrategy(
  bendToken: Contract,
  stakedToken: Contract
) {
  return await deployContract("GovernanceStrategy", [
    bendToken.address,
    stakedToken.address,
  ]);
}

export async function deployGovernance() {
  let addresses = await ethers.getSigners();
  const [deployer, guardian] = addresses;
  const users = addresses.slice(2, addresses.length);
  const vault = await deployVault();
  const { bendToken, stakedToken } = await deployStakedToken(
    vault,
    makeBN18(1000000),
    deployer.address
  );
  const governance = await deployContract("Governance", [15, guardian.address]);

  const governanceStrategy = await deployGovernanceStrategy(
    bendToken,
    stakedToken
  );
  const delay = 60; // 60 secs
  const gracePeriod = 60 * 60 * 24 * 14;
  const minimumDelay = 1;
  const maximumDelay = 60 * 60 * 24 * 30;
  const propositionThreshold = 100; //  1% proposition
  const voteDuration = 6; // 5 blocks, to prevent to hang local EVM in testing
  const voteDifferential = 500; // 5%
  const minimumQuorum = 2000; // 20%
  const executor = await deployContract("Executor", [
    governance.address,
    delay,
    gracePeriod,
    minimumDelay,
    maximumDelay,
    propositionThreshold,
    voteDuration,
    voteDifferential,
    minimumQuorum,
  ]);
  waitForTx(await governance.authorizeExecutors([executor.address]));
  waitForTx(await governance.setGovernanceStrategy(governanceStrategy.address));
  waitForTx(await governance.transferOwnership(executor.address));
  return {
    deployer,
    guardian,
    vault,
    users,
    bendToken,
    stakedToken,
    governance,
    governanceStrategy,
    executor,
  } as GovContracts;
}

export async function deployExecutor(
  governance: string,
  delay: number,
  gracePeriod: number,
  minimumDelay: number,
  maximumDelay: number,
  propositionThreshold: number,
  voteDuration: number,
  voteDifferential: number,
  minimumQuorum: number
) {
  const _f = await ethers.getContractFactory("Executor");
  return _f.deploy(
    governance,
    delay,
    gracePeriod,
    minimumDelay,
    maximumDelay,
    propositionThreshold,
    voteDuration,
    voteDifferential,
    minimumQuorum
  );
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
