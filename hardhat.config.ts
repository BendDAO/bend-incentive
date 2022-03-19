import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
require("solidity-coverage");
import dotenv from "dotenv";
dotenv.config();

import { accounts } from "./test-wallets";

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      initialBaseFeePerGas: 0, // workaround from https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136 . Remove when that issue is closed.
      accounts: accounts,
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || "",
      accounts:
        process.env.RINKEBY_PRIVATE_KEY !== undefined
          ? [process.env.RINKEBY_PRIVATE_KEY]
          : [],
    },
    kovan: {
      url: process.env.KOVAN_URL || "",
      accounts:
        process.env.KOVAN_PRIVATE_KEY !== undefined
          ? [process.env.KOVAN_PRIVATE_KEY]
          : [],
    },
    develop: {
      url: process.env.DEVELOP_URL || "",
      accounts:
        process.env.DEVELOP_PRIVATE_KEY !== undefined
          ? [process.env.DEVELOP_PRIVATE_KEY]
          : [],
    },
    mainnet: {
      url: process.env.MAINNET_URL || "",
      accounts:
        process.env.MAINNET_PRIVATE_KEY !== undefined
          ? [process.env.MAINNET_PRIVATE_KEY]
          : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
