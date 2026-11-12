import { ethers } from "hardhat";
import { FEEDS, readDeployment, writeDeployment } from "./lib";

/**
 * Seeds the first slate of markets.
 *
 *   npx hardhat run scripts/seed.ts --network robinhood
 *
 * Thresholds are derived from the live Chainlink answer at seed time, so a
 * market always opens at a realistic distance from spot. Every market's rule
 * text names the exact feed, comparator and cutoff the contract enforces.
 */
type Seed = {
  key: string;
  base: string; // NVDA / AAPL / ... or empty for WIF-native markets
  factor: number; // threshold = spot * factor
  lte?: boolean;
  question: (v: string) => string;
  rule: (v: string, t: string) => string;
  kind: 0 | 1;
  hoursToClose?: number;
  hoursToResolve?: number;
  fixedCutoff?: "friday" | "sunday";
};

const SEEDS: Seed[] = [
  {
    key: "nvda-fri",
    base: "NVDA",
    factor: 1.02,
    kind: 1,
    fixedCutoff: "friday",
    question: (v) => `Will NVDA close at or above $${v} on Friday?`,
    rule: (v, t) =>
      `YES if the Chainlink NVDA/USD feed (${FEEDS.NVDA}) prints at or above $${v} in the first round published at or after ${t}. NO otherwise. The contract pins the round, so nobody can pick a friendlier print.`,
  },
  {
    key: "aapl-fri",
    base: "AAPL",
    factor: 1.015,
    kind: 1,
    fixedCutoff: "friday",
    question: (v) => `Will AAPL close at or above $${v} on Friday?`,
    rule: (v, t) =>
      `YES if the Chainlink AAPL/USD feed (${FEEDS.AAPL}) prints at or above $${v} in the first round published at or after ${t}. NO otherwise, including if the round lands after the cutoff.`,
  },
  {
    key: "tsla-fri",
    base: "TSLA",
    factor: 1.03,
    kind: 1,
    fixedCutoff: "friday",
    question: (v) => `Will TSLA close at or above $${v} on Friday?`,
    rule: (v, t) =>
      `YES if the Chainlink TSLA/USD feed (${FEEDS.TSLA}) prints at or above $${v} in the first round published at or after ${t}. NO otherwise.`,
  },
  {
    key: "gme-below-fri",
    base: "GME",
    factor: 0.97,
    lte: true,
    kind: 1,
    fixedCutoff: "friday",
    question: (v) => `Will GME close at or below $${v} on Friday?`,
    rule: (v, t) =>
      `YES if the Chainlink GME/USD feed (${FEEDS.GME}) prints at or below $${v} in the first round published at or after ${t}. NO otherwise.`,
  },
  {
    key: "btc-30h",
    base: "BTC",
    factor: 1.03,
    kind: 1,
    hoursToClose: 30,
    hoursToResolve: 31,
    question: (v) => `Will BTC be at or above $${v} in 30 hours?`,
    rule: (v, t) =>
      `YES if the Chainlink BTC/USD feed (${FEEDS.BTC}) prints at or above $${v} in the first round published at or after ${t}. NO otherwise.`,
  },
  {
    key: "eth-below-30h",
    base: "ETH",
    factor: 0.97,
    lte: true,
    kind: 1,
    hoursToClose: 30,
    hoursToResolve: 31,
    question: (v) => `Will ETH be at or below $${v} in 30 hours?`,
    rule: (v, t) =>
      `YES if the Chainlink ETH/USD feed (${FEEDS.ETH}) prints at or below $${v} in the first round published at or after ${t}. NO otherwise.`,
  },
  {
    key: "burn-1m",
    base: "",
    factor: 0,
    kind: 0,
    fixedCutoff: "sunday",
    question: () => "Will Flat Bets pass 1,000,000 WIF burned by Sunday?",
    rule: (_, t) =>
      `YES if FlatBets.totalBurned() on this contract reads at least 1,000,000 WIF at ${t}. The number is on chain and anyone can read it. Resolver checks the value and settles.`,
  },
  {
    key: "wif-mcap",
    base: "",
    factor: 0,
    kind: 0,
    fixedCutoff: "sunday",
    question: () => "Will $WIF hold a $1.5M market cap through Sunday?",
    rule: (_, t) =>
      `YES if DexScreener lists the deepest WIF/USDG pair on Robinhood Chain above $1,500,000 fully diluted valuation at ${t}. Source: dexscreener.com, pair for 0x5173b8eA6923c2d40267890D45C46a3480954773. Resolver posts the snapshot link in the market thread and settles.`,
  },
];

function nextUtcWeekday(day: number, hour: number): number {
  // day: 0=Sun..6=Sat (UTC)
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getTime() <= Date.now() + 6 * 3600_000) d.setUTCDate(d.getUTCDate() + 7);
  return Math.floor(d.getTime() / 1000);
}

function fmtUtc(ts: number): string {
  return new Date(ts * 1000).toISOString().replace(".000Z", " UTC").replace("T", " ");
}

async function spot(feed: string): Promise<{ answer: bigint; decimals: number; updatedAt: number }> {
  const f = await ethers.getContractAt(
    ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)", "function decimals() view returns (uint8)"],
    feed,
  );
  const [roundId, answer, , updatedAt, answeredInRound] = await f.latestRoundData();
  if (answeredInRound < roundId || updatedAt === 0n) throw new Error(`stale feed ${feed}`);
  return { answer, decimals: Number(await f.decimals()), updatedAt: Number(updatedAt) };
}

async function main() {
  const dep = readDeployment();
  if (!dep?.address) throw new Error("no deployment yet, run scripts/deploy.ts first");
  const [signer] = await ethers.getSigners();
  const fb = await ethers.getContractAt("FlatBets", dep.address);

  const created: any[] = [];
  for (const s of SEEDS) {
    let threshold = 0n;
    let valueLabel = "";
    let question = "";
    let resolveAt: number;
    let closeAt: number;

    if (s.fixedCutoff === "friday") {
      resolveAt = nextUtcWeekday(5, 20);
      closeAt = resolveAt - 30 * 60;
    } else if (s.fixedCutoff === "sunday") {
      resolveAt = nextUtcWeekday(0, 23);
      closeAt = resolveAt - 3 * 3600;
    } else {
      closeAt = Math.floor(Date.now() / 1000) + (s.hoursToClose ?? 30) * 3600;
      resolveAt = Math.floor(Date.now() / 1000) + (s.hoursToResolve ?? 31) * 3600;
    }

    if (s.kind === 1) {
      const p = await spot(FEEDS[s.base as keyof typeof FEEDS]);
      const human = Number(p.answer) / 10 ** p.decimals;
      const target = human * s.factor;
      const rounded = target >= 1000 ? Math.round(target / 50) * 50 : target >= 100 ? Math.round(target) : Math.round(target * 100) / 100;
      valueLabel = String(rounded);
      threshold = BigInt(Math.round(rounded * 10 ** p.decimals));
      console.log(`${s.key}: spot ${human.toFixed(2)} -> threshold ${valueLabel} (updated ${fmtUtc(p.updatedAt)})`);
    }

    question = s.question(valueLabel);
    const rule = s.rule(valueLabel, fmtUtc(resolveAt));
    if (Buffer.byteLength(rule) > 600) throw new Error(`rule too long for ${s.key}: ${Buffer.byteLength(rule)}`);

    const tx = await fb.createMarket(
      question,
      rule,
      closeAt,
      resolveAt,
      s.kind,
      s.lte ?? false,
      s.kind === 1 ? FEEDS[s.base as keyof typeof FEEDS] : ethers.ZeroAddress,
      threshold,
      signer.address,
    );
    const rc = await tx.wait();
    const id = (await fb.marketCount()) - 1n;
    const rec = {
      id: Number(id),
      key: s.key,
      question,
      rule,
      kind: s.kind,
      lte: s.lte ?? false,
      feed: s.kind === 1 ? FEEDS[s.base as keyof typeof FEEDS] : null,
      threshold: threshold.toString(),
      thresholdHuman: valueLabel,
      closeAt,
      resolveAt,
      closeAtIso: fmtUtc(closeAt),
      resolveAtIso: fmtUtc(resolveAt),
      txHash: tx.hash,
      block: rc?.blockNumber,
      gasUsed: rc?.gasUsed.toString(),
    };
    created.push(rec);
    console.log(`#${rec.id} ${question}\n    tx ${tx.hash}`);
  }

  const p = writeDeployment("markets", { contract: dep.address, seededAt: new Date().toISOString(), markets: created });
  console.log("wrote", p);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
