import * as fs from "fs";
import * as path from "path";

export const CHAIN_ID = 4663;
export const RH_RPC = process.env.RH_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com/";

export const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/// Chainlink proxies on Robinhood Chain, read from
/// https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json
export const FEEDS = {
  NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  AAPL: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
  TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38",
  SPY: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
  GME: "0x27C71df6A64fB476468EdF256CF72c038baB5B67",
  PLTR: "0x820ABedFF239034956B7A9d2F0a331f9F075eB4c",
  BTC: "0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251",
  ETH: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
} as const;

export const TOKENS = {
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  SPY: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
} as const;

export type MarketSpec = {
  question: string;
  rule: string;
  kind: 0 | 1;
  feed?: string;
  symbol?: string;
  factor?: number; // threshold = live price * factor, only for feed markets
  hoursToClose: number;
  hoursToResolve: number;
  resolver: string;
};

export function readDeployment(name = "flatbets") {
  const p = path.join(__dirname, "..", "deployments", `${name}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeDeployment(name: string, data: unknown) {
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}
