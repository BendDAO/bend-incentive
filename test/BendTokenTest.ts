import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { Network } from "./types";
import {
  getBendTokenDomainSeparatorPerNetwork,
  MAX_UINT_AMOUNT,
  ZERO_ADDRESS,
} from "./constants";
import {
  buildPermitParams,
  getSignatureFromTypedData,
  waitForTx,
} from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("BendToken", function () {
  let bendToken: Contract;
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let keys: { privateKey: string; balance: string }[];

  before(async function () {
    const BendToken = await ethers.getContractFactory("BendToken");
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(0, addresses.length);
    bendToken = await BendToken.deploy();
    await bendToken.deployed();
    await bendToken.initialize();
    keys = require("../test-wallets.ts").accounts;
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

    expect((await bendToken.decimals()).toString()).to.be.equal(
      "18",
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
    const permitAmount = ethers.utils.parseEther("2").toString();
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
      owner,
      spender,
      nonce,
      permitAmount,
      expiration.toFixed()
    );

    const ownerPrivateKey = keys[0].privateKey;
    if (!ownerPrivateKey) {
      throw new Error("INVALID_OWNER_PK");
    }

    expect((await bendToken.allowance(owner, spender)).toString()).to.be.equal(
      "0",
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith("INVALID_EXPIRATION");

    expect((await bendToken.allowance(owner, spender)).toString()).to.be.equal(
      "0",
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );
  });

  it("Submits a permit with maximum expiration length", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = ethers.utils.parseEther("2").toString();
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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

    expect((await bendToken.allowance(owner, spender)).toString()).to.be.equal(
      "0",
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );

    expect((await bendToken._nonces(owner)).toNumber()).to.be.equal(1);
  });

  it("Cancels the previous permit", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();

    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await bendToken._nonces(owner)).toNumber();
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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

    expect((await bendToken.allowance(owner, spender)).toString()).to.be.equal(
      ethers.utils.parseEther("2"),
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    await waitForTx(
      await bendToken
        .connect(users[1])
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );
    expect((await bendToken.allowance(owner, spender)).toString()).to.be.equal(
      permitAmount,
      "INVALID_ALLOWANCE_AFTER_PERMIT"
    );

    expect((await bendToken._nonces(owner)).toNumber()).to.be.equal(2);
  });

  it("Tries to submit a permit with invalid nonce", async () => {
    const owner = deployer.address;
    const spender = users[1].address;
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      bendToken.address,
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
