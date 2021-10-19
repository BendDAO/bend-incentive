import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, ContractTransaction } from "ethers";
import { deployBendToken } from "./deployHelper";
import { buildPermitParams, getSignatureFromTypedData } from "./testHelper";
import {
  // getBendTokenDomainSeparatorPerNetwork,
  MAX_UINT_AMOUNT,
  ZERO_ADDRESS,
} from "./constants";
import { makeBN18, waitForTx } from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("BendToken", function () {
  let bendToken: Contract;
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let keys: { privateKey: string; balance: string }[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    keys = require("../test-wallets.ts").accounts;

    bendToken = await deployBendToken();
    console.log(`   ${bendToken.address}`);
  });

  it("Checks initial configuration", async () => {
    expect(await bendToken.name()).to.be.equal(
      "Bend Token",
      "Invalid token name"
    );

    expect(await bendToken.symbol()).to.be.equal(
      "BEND",
      "Invalid token symbol"
    );

    expect(await bendToken.decimals()).to.be.equal(
      18,
      "Invalid token decimals"
    );
  });

  // it("Checks the domain separator", async () => {
  //   const DOMAIN_SEPARATOR_ENCODED = getBendTokenDomainSeparatorPerNetwork(
  //     network.name as Network
  //   );
  //   const separator = await bendToken.DOMAIN_SEPARATOR();
  //   expect(separator).to.be.equal(
  //     DOMAIN_SEPARATOR_ENCODED,
  //     "Invalid domain separator"
  //   );
  // });

  it("Reverts submitting a permit with 0 expiration", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const expiration = 0;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = makeBN18(2);
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      expiration.toFixed(),
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    expect(await bendToken.allowance(owner, spender)).to.be.equal(
      0,
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");

    expect(await bendToken.allowance(owner, spender)).to.be.equal(
      0,
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );
  });

  it("Submits a permit with maximum expiration length", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = makeBN18(2);
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    expect(await bendToken.allowance(owner, spender)).to.be.equal(
      0,
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );

    expect(await bendToken._nonces(owner)).to.be.equal(1);
  });

  it("Cancels the previous permit", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);
    expect(await bendToken.allowance(owner, spender)).to.be.equal(
      makeBN18(2),
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    await waitForTx(
      await bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );
    expect(await bendToken.allowance(owner, spender)).to.be.equal(
      permitAmount,
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );

    expect(await bendToken._nonces(owner)).to.be.equal(2);
  });

  it("Tries to submit a permit with invalid nonce", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("Tries to submit a permit with invalid expiration (previous to the current block)", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const expiration = "1";
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(owner, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");
  });

  it("Tries to submit a permit with invalid signature", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(owner, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("Tries to submit a permit with invalid owner", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      "Bend Token",
      owner,
      spender,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(ZERO_ADDRESS, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith("INVALID_OWNER");
  });
});
