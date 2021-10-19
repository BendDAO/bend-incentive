import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployStakedToken } from "../deployHelper";
import { buildPermitParams, getSignatureFromTypedData } from "../testHelper";
import { MAX_UINT_AMOUNT, ZERO_ADDRESS, STAKED_TOKEN_NAME } from "../constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { makeBN18, waitForTx } from "../utils";

describe("StakedToken permit tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let deployer: SignerWithAddress;
  let vault: SignerWithAddress;
  let users: SignerWithAddress[];
  let keys: { privateKey: string; balance: string }[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer, vault] = addresses;
    users = addresses.slice(2, addresses.length);
    keys = require("../../test-wallets.ts").accounts;
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer
    ));
    // console.log(`   ${stakedToken.address}`);
  });

  it("Reverts submitting a permit with 0 expiration", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const expiration = 0;
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = makeBN18(2);
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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

    expect(await stakedToken.allowance(owner, spender)).to.be.eq(
      0,
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      stakedToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");

    expect(await stakedToken.allowance(owner, spender)).to.be.eq(
      0,
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );
  });

  it("Submits a permit with maximum expiration length", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = makeBN18(2);
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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

    expect(await stakedToken.allowance(owner, spender)).to.be.equal(
      "0",
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await stakedToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );

    expect((await stakedToken._nonces(owner)).toNumber()).to.be.equal(1);
  });

  it("Cancels the previous permit", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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

    expect(await stakedToken.allowance(owner, spender)).to.be.equal(
      makeBN18(2),
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    await waitForTx(
      await stakedToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );
    expect(await stakedToken.allowance(owner, spender)).to.be.equal(
      permitAmount,
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );

    expect((await stakedToken._nonces(owner)).toNumber()).to.be.equal(2);
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
      stakedToken.address,
      STAKED_TOKEN_NAME,
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
      stakedToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("Tries to submit a permit with invalid expiration (previous to the current block)", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const expiration = "1";
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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
      stakedToken
        .connect(users[1])
        .permit(owner, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");
  });

  it("Tries to submit a permit with invalid signature", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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
      stakedToken
        .connect(users[1])
        .permit(owner, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith("INVALID_SIGNATURE");
  });

  it("Tries to submit a permit with invalid owner", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await stakedToken._nonces(owner)).toNumber();
    const permitAmount = 0;
    const msgParams = buildPermitParams(
      chainId,
      stakedToken.address,
      STAKED_TOKEN_NAME,
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
      stakedToken
        .connect(users[1])
        .permit(ZERO_ADDRESS, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith("INVALID_OWNER");
  });
});
