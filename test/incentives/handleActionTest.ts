import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import {
  deployBendToken,
  deployIncentivesController,
  deployContract,
  deployVault,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { makeBN18, timeLatest, mineBlockAndIncreaseTime } from "../utils";
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
    caseName: "0 emission, accrued 0 rewards, ",
    emissionPerSecond: 0,
    userBalance: 100,
    totalSupply: 100,
  },
  {
    caseName: "0 user balance, accrued 0 rewards",
    emissionPerSecond: 100,
    userBalance: 0,
    totalSupply: 100,
  },
  {
    caseName: "reset emission to 0, accrued rewards not 0",
    emissionPerSecond: 0,
    userBalance: 100,
    totalSupply: 200,
  },
  {
    caseName: "reset emission, accrued rewards  not 0",
    emissionPerSecond: 1000,
    userBalance: 100,
    totalSupply: 300,
  },
];

describe("BendProtocolIncentivesController handleAction tests", function () {
  let bendToken: Contract;
  let incentivesController: Contract;
  let bWeth: Contract;
  let deployer: SignerWithAddress;
  let deployTime: BigNumber;
  let users: SignerWithAddress[];

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
    const vault = await deployVault();
    bendToken = await deployBendToken(vault, makeBN18(1000000));
    incentivesController = await deployIncentivesController(bendToken, vault);

    deployTime = await timeLatest();
  });
  let i = 0;
  for (const {
    caseName,
    totalSupply,
    userBalance,
    emissionPerSecond,
  } of handleActionScenarios) {
    it(caseName, async () => {
      i++;
      const userAddress = users[i].address;
      await mineBlockAndIncreaseTime(100);
      bWeth = await deployContract("BTokenIncentiveTester", [
        "bWETH",
        "bWETH",
        incentivesController.address,
      ]);
      // update emissionPerSecond in advance to not affect user calculations
      await compareAssetIndex(
        emissionPerSecond,
        incentivesController,
        bWeth,
        userAddress,
        totalSupply,
        userBalance,
        () => bWeth.handleAction(userAddress, totalSupply, userBalance)
      );
    });
  }
});
