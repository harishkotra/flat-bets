// Drive one full testnet round: push every mock feed to a new print, settle the
// feed markets against it, and resolve the manual markets by hand.
//
//   npx hardhat run scripts/settestnet.ts --network robinhoodTestnet
//
// Run it after the slate's resolve times have passed. On a local 46630 node you
// can jump the clock first:
//   npx hardhat --network testnetLocal console
//   > await network.provider.send("evm_increaseTime", [8 * 3600])
//   > await network.provider.send("evm_mine", [])

import { ethers } from "hardhat";
import { readDeployment } from "./lib";

// How far each mock feed moves when the round is driven. Positive = up.
const MOVES: Record<string, number> = { NVDA: 0.02, AAPL: -0.01, TSLA: -0.03, GME: -0.04 };

async function main() {
  const dep = readDeployment("testnet");
  if (!dep) throw new Error("no deployments/testnet.json, run scripts/testnet.ts first");

  const fb = await ethers.getContractAt("FlatBets", dep.flatbets);
  const count = Number(await fb.marketCount());
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  console.log(`chain ${(await ethers.provider.getNetwork()).chainId}  markets ${count}  now ${now}`);

  for (let id = 0; id < count; id++) {
    const m = await fb.getMarket(id);
    if (Number(m.outcome) !== 0) {
      console.log(`market ${id} already settled (outcome ${m.outcome})`);
      continue;
    }
    if (now < Number(m.resolveTime)) {
      const wait = Number(m.resolveTime) - now;
      console.log(`market ${id} not due yet, ${Math.ceil(wait / 60)} min to go`);
      continue;
    }

    if (Number(m.kind) === 1) {
      // read the current print, nudge it, publish a new round at `now`
      const feed = await ethers.getContractAt(
        [
          "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
          "function set(int256,uint256)",
        ],
        m.feed,
      );
      const [roundId, cur] = await feed.latestRoundData();
      const move = MOVES[Object.keys(dep.feeds).find((k) => dep.feeds[k] === m.feed) ?? ""] ?? 0.01;
      const next = (cur * BigInt(Math.round((1 + move) * 1000))) / 1000n;
      await (await feed.set(next, now)).wait();
      await (await fb.resolveWithFeed(id, roundId + 1n)).wait();
      console.log(`market ${id} feed settled at ${ethers.formatUnits(next, 8)}`);
    } else {
      const yes = m.question.toLowerCase().includes("green");
      await (await fb.resolveManual(id, yes ? 1 : 2)).wait();
      console.log(`market ${id} manual settled ${yes ? "YES" : "NO"}`);
    }
  }

  const [markets_, staked_, burned_, claimed_, held_] = await fb.stats();
  console.log(
    `markets ${markets_}  staked ${ethers.formatUnits(staked_, 18)}  burned ${ethers.formatUnits(burned_, 18)}` +
      `  claimed ${ethers.formatUnits(claimed_, 18)}  held ${ethers.formatUnits(held_, 18)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
