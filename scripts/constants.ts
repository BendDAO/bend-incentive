export const ONE_YEAR = 31536000;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
export const MAX_UINT_AMOUNT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

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
          "0xf494F91bef99d4a024650cAaD59bf3268ab578cc",
          "0x7ADd1A52df61Ad94C518042f77800eDCCEf8D43e",
          "0x34a5737D63bF99c5Ea777D61e4364b8F961B64Bf",
        ],
        [100, 200, 300],
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
