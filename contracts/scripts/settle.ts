import { ethers } from "hardhat";
import { readDeployment } from "./lib";

/**
 * Settlement keeper. For every open feed market whose cutoff has passed, it
 * finds the FIRST Chainlink round published at or after that cutoff and settles
 * the market against it. Anyone can run this; the round it picks is verifiable
 * on chain, so the operator is not trusted with the outcome.
 *
 *   npx hardhat run scripts/settle.ts --network robinhood           # settle all
 *   DRY=1 npx hardhat run scripts/settle.ts --network robinhood      # report only
 */
async function firstRoundAfter(
  fb: any,
  id: number,
  cutoff: number,
): Promise<{ roundId: bigint; answer: bigint; updatedAt: bigint } | null> {
  const feed = await fb.getMarket(id);
  const agg = await ethers.getContractAt(
    ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"],
    feed.feed,
  );
  const [latestId] = await agg.latestRoundData();

  // Binary search for the smallest existing round with updatedAt >= cutoff.
  let lo = 1n;
  let hi = latestId;
  const at = async (r: bigint) => {
    const [answer, updatedAt, exists] = await fb.feedRound(id, r);
    return { exists, answer: answer as bigint, updatedAt: updatedAt as bigint };
  };
  const hiData = await at(hi);
  if (!hiData.exists || Number(hiData.updatedAt) < cutoff) return null;

  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const d = await at(mid);
    if (d.exists && Number(d.updatedAt) >= cutoff) hi = mid;
    else lo = mid + 1n;
  }
  const d = await at(lo);
  if (!d.exists || Number(d.updatedAt) < cutoff) return null;
  return { roundId: lo, answer: d.answer, updatedAt: d.updatedAt };
}

async function main() {
  const dep = readDeployment();
  if (!dep?.address) throw new Error("no deployment");
  const fb = await ethers.getContractAt("FlatBets", dep.address);
  const count = Number(await fb.marketCount());
  const dry = process.env.DRY === "1";
  const now = Math.floor(Date.now() / 1000);

  for (let id = 0; id < count; id++) {
    const m = await fb.getMarket(id);
    if (m.kind !== 1n || m.outcome !== 0n) continue;
    if (now < Number(m.resolveTime)) {
      console.log(`#${id} waiting until ${new Date(Number(m.resolveTime) * 1000).toISOString()}`);
      continue;
    }
    const r = await firstRoundAfter(fb, id, Number(m.resolveTime));
    if (!r) {
      console.log(`#${id} no round after cutoff yet`);
      continue;
    }
    const human = Number(r.answer) / 10 ** Number(m.feedDecimals);
    const verdict = (m.lte ? human <= Number(m.threshold) / 10 ** Number(m.feedDecimals) : human >= Number(m.threshold) / 10 ** Number(m.feedDecimals)) ? "YES" : "NO";
    console.log(`#${id} round ${r.roundId} @ ${new Date(Number(r.updatedAt) * 1000).toISOString()} = ${human} -> ${verdict}`);
    if (dry) continue;
    try {
      const tx = await fb.resolveWithFeed(id, r.roundId);
      const rc = await tx.wait();
      console.log(`    settled ${tx.hash} gas ${rc?.gasUsed}`);
    } catch (e: any) {
      console.log(`    failed: ${e.shortMessage ?? e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
