import { iParamsPerNetwork, Network } from "./types";

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
