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
  kovan = "kovan",
  ropsten = "ropsten",
  rinkeby = "rinkeby",
  mainnet = "mainnet",
  develop = "develop",
}

export interface iParamsPerNetwork<T> {
  [Network.coverage]: T;
  [Network.hardhat]: T;
  [Network.kovan]: T;
  [Network.ropsten]: T;
  [Network.rinkeby]: T;
  [Network.mainnet]: T;
  [Network.develop]: T;
}

export const getParamPerNetwork = <T>(
  {
    kovan,
    ropsten,
    rinkeby,
    mainnet,
    develop,
    hardhat,
    coverage,
  }: iParamsPerNetwork<T>,
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
    case Network.develop:
      return develop;
    default:
      return mainnet;
  }
};

export const getBTokenConfig = (network: string): any[] =>
  getParamPerNetwork<any[]>(
    {
      [Network.coverage]: [],
      [Network.hardhat]: [],
      [Network.kovan]: [
        [
          "0xD85EcC6Ce72285388da039f69A6A647b5513974C", // bWETH
          "0x9aF480FcC5Cc4ffE0F7156CBEffbC6298077376B", // bDebtWETH
        ],
        [
          makeBN(10000000000000000), // bWETH
          makeBN(30000000000000000), // bDebtWETH
        ],
      ],
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
      [Network.develop]: [
        [
          "0x929Da10A2864aDe23FD78FA7d3899AeD100BBf9F", // bDAI
          "0x6a942FF1f4711Bf87573C3D9cF11305FABf3d6E7", // bDebtDAI
          "0xD3E9500DB1D0ED37f19FEd8d77B4117bf9A7dd53", // bUSDC
          "0xf9C4A656deC2c94E01BCA7Ee65dB90F0989F7D22", // bDebtUSDC
          "0x050925BAac473Ef020F5Babf3e6CbA68095b90df", // bWETH
          "0x4b47DC724d9Fdefd1d96edf1A91B4B588d506242", // bDebtWETH
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
      [Network.develop]: "",
    },
    Network[network as keyof typeof Network]
  );

export const getFeeDistributorParams = (network: string): string[] =>
  getParamPerNetwork<string[]>(
    {
      [Network.coverage]: [],
      [Network.hardhat]: [],
      [Network.kovan]: [
        "0x2F4dA7F22E603aac1A9840D384d63c91a40ddD8D", //WETH
        "0xD85EcC6Ce72285388da039f69A6A647b5513974C", //bWETH
        "0xFBcd346b1EeFd2c065be476C8a77262889028977", //lendPoolAddressesProvider,
        "0xBC6E81c410FF3b32cDa031267772713f93599077", //bendCollector
      ],
      [Network.ropsten]: [],
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
      [Network.develop]: [],
    },
    Network[network as keyof typeof Network]
  );

export const getSnapshotDelatation = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.kovan]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
      [Network.ropsten]: "",
      [Network.rinkeby]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
      [Network.mainnet]: "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
      [Network.develop]: "",
    },
    Network[network as keyof typeof Network]
  );

export const getBendEthUni = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.kovan]: "",
      [Network.ropsten]: "",
      [Network.rinkeby]: "0x170DC266c6A65C4C686De29E5D4Fc27270373014",
      [Network.mainnet]: "0x336ef4e633b1117dca08c1a57f4139c62c32c935",
      [Network.develop]: "",
    },
    Network[network as keyof typeof Network]
  );

export const getStakedBuniIncentiveConfig = (network: string): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.kovan]: "",
      [Network.ropsten]: "",
      [Network.rinkeby]: "31709791983764587",
      [Network.mainnet]: "3170979198376458752",
      [Network.develop]: "",
    },
    Network[network as keyof typeof Network]
  );
