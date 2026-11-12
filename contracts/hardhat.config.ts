import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEPLOYER_KEY = process.env.FLATBETS_DEPLOYER_KEY ?? "";
const accounts = DEPLOYER_KEY ? [DEPLOYER_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8547", chainId: 31337 },
    hardhat: {
      chainId: 31337,
      hardfork: "shanghai",
      forking: process.env.FORK_RH === "1"
        ? { url: process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com/" }
        : undefined,
    },
    robinhood: {
      url: process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com/",
      chainId: 4663,
      accounts,
    },
    robinhoodTestnet: {
      url: process.env.RH_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
    testnetLocal: { url: "http://127.0.0.1:8548", chainId: 46630 },
  },
  etherscan: {
    apiKey: { robinhood: process.env.BLOCKSCOUT_API_KEY ?? "blockscout" },
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  mocha: { timeout: 120000 },
};

export default config;
