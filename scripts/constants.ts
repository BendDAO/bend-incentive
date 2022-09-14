export const ONE_YEAR = 31536000;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
export const MAX_UINT_AMOUNT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export const BEND_TOKEN_MAX_SUPPLY = 10000000000;

import { makeBN } from "../test/utils";
export enum Network {
  coverage = "coverage",
  hardhat = "hardhat",
  rinkeby = "rinkeby",
  mainnet = "mainnet",
  goerli = "goerli",
}

export interface iParamsPerNetwork<T> {
  [Network.coverage]: T;
  [Network.hardhat]: T;
  [Network.rinkeby]: T;
  [Network.mainnet]: T;
  [Network.goerli]: T;
}

export const getParamPerNetwork = <T>(
  {
    rinkeby,
    mainnet,
    hardhat,
    coverage,
    goerli,
  }: iParamsPerNetwork<T>,
  network: Network
) => {
  switch (network) {
    case Network.coverage:
      return coverage;
    case Network.hardhat:
      return hardhat;
    case Network.rinkeby:
      return rinkeby;
    case Network.mainnet:
      return mainnet;
    case Network.goerli:
      return goerli;
    default:
      return mainnet;
  }
};

export const getBTokenConfig = (network: string): any[] =>
  getParamPerNetwork<any[]>(
    {
      [Network.coverage]: [],
      [Network.hardhat]: [],
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
      [Network.mainnet]: [
        [
          "0xeD1840223484483C0cb050E6fC344d1eBF0778a9", // bendWETH
          "0x87ddE3A3f4b629E389ce5894c9A1F34A7eeC5648", // bendDebtWETH
        ],
        [
          makeBN(6341958391203703000), // bendWETH
          makeBN(19025875173611110000), // bendDebtWETH
        ],
      ],
      [Network.goerli]: [
        [
          "0x57FEbd640424C85b72b4361fE557a781C8d2a509", // bendWETH
          "0x9aB83A4886dCE3C0c1011f9D248249DD3eF64784", // bendDebtWETH
        ],
        [
          makeBN(6341958391203703000), // bendWETH
          makeBN(19025875173611110000), // bendDebtWETH
        ],
      ],
    },
    Network[network as keyof typeof Network]
  );

export const getUniswapV3Factory = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0x815BCC87613315327E04e4A3b7c96a79Ae80760c",
      [Network.mainnet]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      [Network.goerli]: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    },
    Network[network as keyof typeof Network]
  );

export const getFeeDistributorParams = (network: string): string[] =>
  getParamPerNetwork<string[]>(
    {
      [Network.coverage]: [],
      [Network.hardhat]: [],
      [Network.rinkeby]: [
        "0xaD1908f909B5C5D2B1032a215d611773F26f089F", //WETH
        "0x1BBcE5469B8BCc5078AE2398476350936d1393Af", //bWETH
        "0xE55870eBB007a50B0dfAbAdB1a21e4bFcee5299b", //lendPoolAddressesProvider,
        "0x7A02EE743Aadca63d60945971B7eD12c7f26b6d2", //bendCollector
      ],
      [Network.mainnet]: [
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", //WETH
        "0xeD1840223484483C0cb050E6fC344d1eBF0778a9", //bWETH
        "0x24451F47CaF13B24f4b5034e1dF6c0E401ec0e46", //lendPoolAddressesProvider,
        "0x43078AbfB76bd24885Fd64eFFB22049f92a8c495", //bendCollector
      ],
      [Network.goerli]: [
        "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", //WETH
        "0x57FEbd640424C85b72b4361fE557a781C8d2a509", //bWETH
        "0x1cba0A3e18be7f210713c9AC9FE17955359cC99B", //lendPoolAddressesProvider,
        "0x32B08f895d93a207e8A5C9405870D780A43b25Dd", //bendCollector
      ],
    },
    Network[network as keyof typeof Network]
  );

export const getSnapshotDelatation = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
      [Network.mainnet]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
      [Network.goerli]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
    },
    Network[network as keyof typeof Network]
  );

export const getBendEthUni = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0x170DC266c6A65C4C686De29E5D4Fc27270373014",
      [Network.mainnet]: "0x336ef4e633b1117dca08c1a57f4139c62c32c935",
      [Network.goerli]: "0x1b2A26C8c107eD4a36957bCfbe07E5F6E6a1EF51",
    },
    Network[network as keyof typeof Network]
  );

export const getStakedBuniIncentiveConfig = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "3170979198376458752",
      [Network.mainnet]: "3170979198376458752",
      [Network.goerli]: "3170979198376458752",
    },
    Network[network as keyof typeof Network]
  );

export const getWETH = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0xaD1908f909B5C5D2B1032a215d611773F26f089F",
      [Network.mainnet]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      [Network.goerli]: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    },
    Network[network as keyof typeof Network]
  );

export const getBWETH = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0x162f6ef816c8b03193c50852fffb570d97ceea2f",
      [Network.mainnet]: "0xeD1840223484483C0cb050E6fC344d1eBF0778a9",
      [Network.goerli]: "0x57FEbd640424C85b72b4361fE557a781C8d2a509",
    },
    Network[network as keyof typeof Network]
  );

export const getTreasury = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0xcbb8a164d498e0c2312f0ddcf0a6ee2f5bad983a",
      [Network.mainnet]: "0x472FcC65Fab565f75B1e0E861864A86FE5bcEd7B",
      [Network.goerli]: "0x5011Ea004b9F7615333DDC7Fbe60D9eF42D2b8C5",
    },
    Network[network as keyof typeof Network]
  );

export const getLendPoolAddressesProvider = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0xE55870eBB007a50B0dfAbAdB1a21e4bFcee5299b",
      [Network.mainnet]: "0x24451F47CaF13B24f4b5034e1dF6c0E401ec0e46",
      [Network.goerli]: "0x1cba0A3e18be7f210713c9AC9FE17955359cC99B",
    },
    Network[network as keyof typeof Network]
  );

export const getBendCollector = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.rinkeby]: "0x7A02EE743Aadca63d60945971B7eD12c7f26b6d2",
      [Network.mainnet]: "0x43078AbfB76bd24885Fd64eFFB22049f92a8c495",
      [Network.goerli]: "0x32B08f895d93a207e8A5C9405870D780A43b25Dd",
    },
    Network[network as keyof typeof Network]
  );
