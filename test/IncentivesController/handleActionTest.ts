import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import {
  deployStakedToken,
  deployIncentivesController,
  deployContract,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { makeBN18, timeLatest, fastForwardTimeAndBlock } from "../utils";
import { compareAssetIndex } from "../testHelper";

type ScenarioAction = {
  caseName: string;
  emissionPerSecond: number;
  userBalance: number;
  totalSupply: number;
  customTimeMovement?: number;
};

const handleActionScenarios: ScenarioAction[] = [
  {
    caseName: "All 0",
    emissionPerSecond: 0,
    userBalance: 0,
    totalSupply: 0,
  },
  {
    caseName: "Accrued rewards are 0, 0 emission",
    emissionPerSecond: 0,
    userBalance: 111,
    totalSupply: 111,
  },
  {
    caseName: "Accrued rewards are 0, 0 user balance",
    emissionPerSecond: 100,
    userBalance: 0,
    totalSupply: 111,
  },
  {
    caseName: "1. Accrued rewards are not 0",
    emissionPerSecond: 0,
    userBalance: 111,
    totalSupply: 111,
  },
  {
    caseName: "2. Accrued rewards are not 0",
    emissionPerSecond: 1000,
    userBalance: 222,
    totalSupply: 333,
  },
];

describe("StakedTokenIncentivesController handleAction tests", function () {
  let bendToken: Contract;
  let stakedToken: Contract;
  let incentivesController: Contract;
  let bWeth: Contract;
  let deployer: SignerWithAddress;
  let deployTime: BigNumber;
  let vault: SignerWithAddress;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer, vault] = addresses;
    users = addresses.slice(2, addresses.length);
    ({ bendToken, stakedToken } = await deployStakedToken(
      vault,
      makeBN18(1000000),
      deployer
    ));
    incentivesController = await deployIncentivesController(
      bendToken,
      stakedToken,
      vault,
      deployer
    );

    deployTime = await timeLatest();
  });
  for (const {
    caseName,
    totalSupply,
    userBalance,
    emissionPerSecond,
  } of handleActionScenarios) {
    it(caseName, async () => {
      const userAddress = users[1].address;
      await fastForwardTimeAndBlock(100);
      bWeth = await deployContract("BTokenMock", [
        "bWETH",
        "bWETH",
        incentivesController.address,
      ]);
      await bWeth.setUserBalanceAndSupply(
        userAddress,
        userBalance,
        totalSupply
      );

      // update emissionPerSecond in advance to not affect user calculations
      await compareAssetIndex(
        emissionPerSecond,
        incentivesController,
        bWeth,
        userAddress,
        totalSupply,
        userBalance,
        () => bWeth.handleActionOnAic(userAddress, totalSupply, userBalance)
      );
    });
  }
});
