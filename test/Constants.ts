import { iParamsPerNetwork, Network } from "./types";

export const MAX_UINT_AMOUNT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const STAKED_TOKEN_NAME = "Staked BEND";
export const STAKED_TOKEN_SYMBOL = "stkBEND";
export const STAKED_TOKEN_DECIMALS = 18;
export const COOLDOWN_SECONDS = 3600;
export const UNSTAKE_WINDOW = 1800;

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

export const getBendTokenDomainSeparatorPerNetwork = (
  network: Network
): string =>
  getParamPerNetwork<string>(
    {
      [Network.coverage]: "",
      [Network.hardhat]: "",
      [Network.kovan]: "",
      [Network.ropsten]: "",
      [Network.rinkeby]: "",
      [Network.mainnet]: "",
    },
    network
  );
