// Deploy the whole Flat Bets stack to Robinhood Chain Testnet (chain id 46630).
//
// The testnet ships a WIF-symbol token ("RobinWifHat", 18 decimals) but no
// Chainlink stock feeds, so this script:
//   * uses the existing testnet WIF when TESTNET_WIF is set (default: the
//     RobinWifHat token below), otherwise deploys MockWIF,
//   * deploys one mock feed per ticker, since the testnet has no stock feeds,
//   * funds three fresh bettor wallets from the deployer so the board has two
//     sides without needing extra keys from you.
//
//   TESTNET_WIF=0x... npx hardhat run scripts/testnet.ts --network robinhoodTestnet
//
// Requires FLATBETS_DEPLOYER_KEY to hold testnet ETH for gas and ~15,000 testnet
// WIF for the creation fees and the demo stakes.

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { writeDeployment } from "./lib";

const CHAIN_ID = 46630;
const HOUR = 3600;
const WIF_UNIT = 10n ** 18n;
const DEFAULT_WIF = "0x8B00F5B2B0F96F0deBa57D7A9F16e11FABCa8ed3"; // RobinWifHat, symbol WIF
const BETTOR_BUFFER = 300n * WIF_UNIT;
const MARKET_COUNT = 6;

type FeedSpec = { symbol: string; price: number; decimals: number };

const FEEDS: FeedSpec[] = [
  { symbol: "NVDA", price: 187.42, decimals: 8 },
  { symbol: "AAPL", price: 231.18, decimals: 8 },
  { symbol: "TSLA", price: 412.75, decimals: 8 },
  { symbol: "GME", price: 26.19, decimals: 8 },
];

const BETS: Array<[number, number, 1 | 2, string]> = [
  [0, 0, 1, "1200"], [1, 0, 2, "800"], [2, 0, 1, "450"],
  [0, 1, 2, "900"], [1, 1, 2, "600"], [2, 1, 1, "250"],
  [1, 2, 1, "1500"], [2, 2, 2, "500"],
  [0, 3, 2, "700"], [2, 4, 1, "250"], [1, 4, 2, "1100"],
  [0, 5, 1, "1800"], [2, 5, 2, "320"],
  ];

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function mint(address,uint256)",
];

async function main() {
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    throw new Error(`wrong chain: ${net.chainId}, want ${CHAIN_ID} (Robinhood Chain Testnet)`);
  }

  const [deployer] = await ethers.getSigners();
  const gas = await ethers.provider.getFeeData();
  console.log(`chain ${net.chainId}  deployer ${deployer.address}`);
  const gasPrice = gas.gasPrice ?? 0n;
  const startEth = await ethers.provider.getBalance(deployer.address);
  console.log(`balance ${ethers.formatEther(startEth)} ETH  gasPrice ${gasPrice}`);

  // A full run measured at ~40M gas on the 46630 fork: 7 deploys, 6 markets,
  // 20 bet and approve txs. Checked up front so a thin faucet drip fails with a
  // number instead of a stack trace.
  const estCost = 45_000_000n * gasPrice;
  if (startEth < estCost) {
    console.warn(
      `ETH short: the full run needs about ${ethers.formatEther(estCost)} ETH, deployer holds ` +
        `${ethers.formatEther(startEth)}. Top up at https://faucet.testnet.chain.robinhood.com`,
    );
  }

  // keep two thirds of the ETH for the deployer, split the rest three ways
  const bettorGas = (startEth - startEth / 3n) / 3n;

  const txs: Array<{ what: string; hash: string }> = [];
  const send = async (what: string, p: Promise<any>) => {
    const tx = await p;
    const rc = await tx.wait();
    txs.push({ what, hash: rc!.hash });
    return rc;
  };

  // 1. WIF ------------------------------------------------------------------
  // Three ways in, so the demo never dead-ends on token supply:
  //   * RobinWifHat testnet WIF with 15k+ -> full 250 WIF fees, full stakes
  //   * RobinWifHat with 2k-15k          -> 40 WIF fees, stakes scaled to fit
  //   * anything less, or USE_MOCK_WIF=1 -> deploy MockWIF and mint 500k
  const wantsMock = process.env.USE_MOCK_WIF === "1";
  const wifAddrCandidate = (process.env.TESTNET_WIF || DEFAULT_WIF).trim();
  const hasCode = (await ethers.provider.getCode(wifAddrCandidate)) !== "0x";

  let wifAddr = wifAddrCandidate;
  let wif: any;
  let usedMock = false;
  let wifBal = 0n;

  if (!wantsMock && hasCode) {
    wif = new ethers.Contract(wifAddr, ERC20, deployer);
    wifBal = await wif.balanceOf(deployer.address);
    console.log(`testnet WIF ${wifAddr}`);
    console.log(`deployer WIF ${ethers.formatUnits(wifBal, 18)}`);
  }

  if (!wif || wifBal < 1_500n * WIF_UNIT) {
    if (wif) {
      console.log(
        `holding ${ethers.formatUnits(wifBal, 18)} WIF, not enough for the 1,500 creation fees. ` +
          `Switching to a mock WIF so the demo still runs today.`,
      );
    }
    const Mock = await ethers.getContractFactory("MockWIF");
    const m = await Mock.deploy();
    await m.waitForDeployment();
    wif = m;
    wifAddr = await m.getAddress();
    usedMock = true;
    await send("mint 500k test WIF to deployer", wif.mint(deployer.address, 500_000n * WIF_UNIT));
    wifBal = 500_000n * WIF_UNIT;
    console.log(`mock WIF  ${wifAddr}  (minted 500,000 to deployer)`);
  }

  // creation fee and stake size follow the balance we actually have
  const totalDemoWif = BETS.reduce((sum, b) => sum + ethers.parseUnits(b[3], 18), 0n);
  const FULL = 15_000n * WIF_UNIT;
  let creationFee = 250n * WIF_UNIT;
  let stakePct = 100n;
  if (wifBal < FULL) {
    creationFee = 40n * WIF_UNIT;
    const fees = creationFee * BigInt(MARKET_COUNT);
    const spare = wifBal - fees - 3n * BETTOR_BUFFER - 100n * WIF_UNIT;
    stakePct = spare > 0n ? (spare * 100n) / totalDemoWif : 0n;
    console.log(
      `tight budget: creation fee ${ethers.formatUnits(creationFee, 18)} WIF, ` +
        `demo stakes at ${stakePct}% of full size`,
    );
  }

  // 2. mock feeds ----------------------------------------------------------
  const Feed = await ethers.getContractFactory("MockFeed");
  const feedAddrs: Record<string, string> = {};
  for (const f of FEEDS) {
    const feed = await Feed.deploy(f.decimals, BigInt(Math.round(f.price * 10 ** f.decimals)));
    await feed.waitForDeployment();
    feedAddrs[f.symbol] = await feed.getAddress();
    console.log(`feed ${f.symbol.padEnd(5)} ${feedAddrs[f.symbol]}  ${f.price}`);
  }

  // 3. the market contract -------------------------------------------------
  const FlatBets = await ethers.getContractFactory("FlatBets");
  const fb = await FlatBets.deploy(wifAddr, creationFee);
  await fb.waitForDeployment();
  const addr = await fb.getAddress();
  console.log(`FlatBets  ${addr}`);
  await send("approve WIF to FlatBets", wif.approve(addr, ethers.MaxUint256));

  // 4. slate ---------------------------------------------------------------
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const C = 1; // Kind.Feed
  const M = 0; // Kind.Manual

  const slate: Array<[string, string, number, number, number, boolean, string, number, string]> = [
    ["Will NVDA close above 185?",
      "Yes if the Chainlink NVDA/USD print first published at or after the cutoff is above 185.",
      now + 6 * HOUR, now + 7 * HOUR, C, false, "NVDA", 185, ""],
    ["Will AAPL hold 230 into the close?",
      "Yes if the Chainlink AAPL/USD print first published at or after the cutoff is at or above 230.",
      now + 6 * HOUR, now + 7 * HOUR, C, true, "AAPL", 230, ""],
    ["Will TSLA give back 2% today?",
      "Yes if the Chainlink TSLA/USD print first published at or after the cutoff is below 405.",
      now + 6 * HOUR, now + 7 * HOUR, C, true, "TSLA", 405, ""],
    ["Will GME squeeze past 27?",
      "Yes if the Chainlink GME/USD print first published at or after the cutoff is above 27.",
      now + 6 * HOUR, now + 7 * HOUR, C, false, "GME", 27, ""],
    ["Will the mock index finish green?",
      "Resolved manually by the deployer from the testnet session result.",
      now + 3 * HOUR, now + 4 * HOUR, M, false, "", 0, ""],
    ["Will the next test round fill before close?",
      "Resolved manually by the deployer when the test round closes.",
      now + 2 * HOUR, now + 3 * HOUR, M, false, "", 0, ""],
  ];

  for (const [q, rule, close, resolve, kind, lte, sym, thr, resolver] of slate) {
    const feedAddr = sym ? feedAddrs[sym] : ethers.ZeroAddress;
    const threshold = sym ? BigInt(Math.round(thr * 10 ** 8)) : 0n;
    await send(
      `createMarket: ${q.slice(0, 40)}`,
      fb.createMarket(q, rule, close, resolve, kind, lte, feedAddr, threshold, resolver || deployer.address),
    );
  }
  console.log(`created ${slate.length} markets`);

  // 5. demo stakes so the board is not empty -------------------------------
  // Throwaway wallets generated here, funded by the deployer, so one key is
  // enough to give every market two sides.
  const stakeOf = (amount: string) => {
    const full = ethers.parseUnits(amount, 18);
    const scaled = (full * stakePct) / 100n;
    return scaled < 10n * WIF_UNIT ? 10n * WIF_UNIT : scaled;
  };

  const need = [0n, 0n, 0n];
  for (const [who, , , amount] of BETS) need[who] += stakeOf(amount);

  const bettors = [];
  for (let i = 0; i < 3; i++) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    const fund = need[i] + (need[i] > 0n ? BETTOR_BUFFER : 0n);
    if (bettorGas > 0n) {
      await send(`fund bettor ${i} gas`, deployer.sendTransaction({ to: w.address, value: bettorGas }));
    }
    if (fund > 0n) await send(`fund bettor ${i} ${ethers.formatUnits(fund, 18)} WIF`, wif.transfer(w.address, fund));
    await send(`approve bettor ${i}`, wif.connect(w).approve(addr, ethers.MaxUint256));
    bettors.push(w);
  }

  for (const [who, id, side, amount] of BETS) {
    await send(
      `bet market ${id} side ${side} ${ethers.formatUnits(stakeOf(amount), 18)}`,
      fb.connect(bettors[who]).bet(id, side, stakeOf(amount)),
    );
  }

  const [markets_, , burned_] = await fb.stats();
  console.log(`markets ${markets_}  burned ${ethers.formatUnits(burned_, 18)} WIF`);

  // keys go to a gitignored sidecar so the deployment record stays shareable
  const keysPath = path.join(__dirname, "..", "deployments", "testnet.keys.json");
  fs.writeFileSync(
    keysPath,
    JSON.stringify(bettors.map((b) => ({ address: b.address, key: b.privateKey })), null, 2),
  );

  const outPath = writeDeployment("testnet", {
    chainId: CHAIN_ID,
    flatbets: addr,
    wif: wifAddr,
    wifDeployedByScript: usedMock,
    creationFee: creationFee.toString(),
    stakePct: stakePct.toString(),
    feeds: feedAddrs,
    deployer: deployer.address,
    bettors: bettors.map((b) => b.address),
    markets: slate.length,
    createdAt: new Date().toISOString(),
    txs,
  });
  console.log(`wrote ${outPath}`);

  console.log("\n--- web/.env for testnet ---");
  console.log(`VITE_CHAIN_ID=${CHAIN_ID}`);
  console.log("VITE_RPC=https://rpc.testnet.chain.robinhood.com");
  console.log("VITE_EXPLORER=https://explorer.testnet.chain.robinhood.com");
  console.log(`VITE_FLATBETS_ADDRESS=${addr}`);
  console.log("--- end ---");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
