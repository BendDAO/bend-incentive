import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { Network } from "./types";
import { getBendTokenDomainSeparatorPerNetwork } from "./constants";

describe("BendToken", function () {
  let bendToken: Contract;
  let owner;
  beforeEach(async function () {
    const BendToken = await ethers.getContractFactory("BendToken");
    [owner] = await ethers.getSigners();
    bendToken = await BendToken.deploy();
    await bendToken.initialize();
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

  it("Checks the domain separator", async () => {
    const DOMAIN_SEPARATOR_ENCODED = getBendTokenDomainSeparatorPerNetwork(
      network.name as Network
    );
    const separator = await bendToken.DOMAIN_SEPARATOR();
    expect(separator).to.be.equal(
      DOMAIN_SEPARATOR_ENCODED,
      "Invalid domain separator"
    );
  });
});
