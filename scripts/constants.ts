export const ONE_YEAR = 31536000;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
export const MAX_UINT_AMOUNT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
import { makeBN } from "../test/utils";
export enum Network {
  coverage = "coverage",
  hardhat = "hardhat",
  kovan = "kovan",
  ropsten = "ropsten",
  rinkeby = "rinkeby",
  mainnet = "mainnet",
}

export interface iParamsPerNetwork<T> {
  [Network.coverage]: T;
  [Network.hardhat]: T;
  [Network.kovan]: T;
  [Network.ropsten]: T;
  [Network.rinkeby]: T;
  [Network.mainnet]: T;
}

export const getParamPerNetwork = <T>(
  { kovan, ropsten, rinkeby, mainnet, hardhat, coverage }: iParamsPerNetwork<T>,
  network: Network
) => {
  switch (network) {
    case Network.coverage:
      return coverage;
    case Network.hardhat:
      return hardhat;
    case Network.kovan:
      return kovan;
    case Network.ropsten:
      return ropsten;
    case Network.rinkeby:
      return rinkeby;
    case Network.mainnet:
      return mainnet;
    default:
      return mainnet;
  }
};

export const getBTokenConfig = (network: string): any[] =>
  getParamPerNetwork<any[]>(
    {
      [Network.coverage]: [],
      [Network.hardhat]: [],
      [Network.kovan]: [],
      [Network.ropsten]: [],
      [Network.rinkeby]: [
        [
          "0xd0A107FC6F70B60DAD88d7fB4Cff1A655380cAE5", // bDAI
          "0x30BD75Cdd5a3d96e258332343792A4409B4B409C", // bDebtDAI
          "0x6F6bdC9Ff12c73c04D69b2e0611c00cA56150BB3", // bUSDC
          "0x6c7d4c4c2fbd0c30D40A533E42d7318BF012A900", // bDebtUSDC
          "0x1BBcE5469B8BCc5078AE2398476350936d1393Af", // bWETH
          "0xe42f3a56F89546a2596b88cff08234c5EEa304b7", // bDebtWETH
        ],
        [
          makeBN(10000000000000000), // bDAI
          makeBN(30000000000000000), // bDebtDAI
          makeBN(10000000000000000), // bUSDC
          makeBN(30000000000000000), // bDebtUSDC
          makeBN(10000000000000000), // bWETH
          makeBN(30000000000000000), // bDebtWETH
        ],
      ],
      [Network.mainnet]: [],
    },
    Network[network as keyof typeof Network]
  );

export const getStakedBendConfig = (network: string): number =>
  getParamPerNetwork<number>(
    {
      [Network.coverage]: 0,
      [Network.hardhat]: 0,
      [Network.kovan]: 0,
      [Network.ropsten]: 0,
      [Network.rinkeby]: 100,
      [Network.mainnet]: 0,
    },
    Network[network as keyof typeof Network]
  );

export const getUniswapV3Factory = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.kovan]: "",
      [Network.ropsten]: "",
      [Network.rinkeby]: "0x815BCC87613315327E04e4A3b7c96a79Ae80760c",
      [Network.mainnet]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
    Network[network as keyof typeof Network]
  );
