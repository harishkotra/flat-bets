import { ethers, network } from "hardhat";
import { FEEDS, WIF } from "./lib";

/**
 * Seeds a fork (or any chain) with a full slate of markets so the frontend has
 * something real to render. Thresholds are derived from the live Chainlink
 * answer at seed time, so every market opens at a believable distance from spot.
 *
 *   npx hardhat run scripts/seedfork.ts --network localhost
 */
const FEE = ethers.parseUnits("250", 18);

const WIF_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];

const WHALE = "0x1089a7C3915c9F067615909DBd07697C21c32156";

const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
];

// symbol, step away from spot, comparator, minutes to close, hours to resolution
const SLATE: Array<[string, number, boolean, number, string]> = [
  ["NVDA", 1.015, false, 60, "Will NVDA hold above spot through the close?"],
  ["NVDA", 0.985, true, 60, "Will NVDA slip below spot by the close?"],
  ["AAPL", 1.01, false, 90, "Will AAPL break out 1% by the close?"],
  ["TSLA", 0.99, true, 90, "Will TSLA give back a percent by the close?"],
  ["SPY", 1.005, false, 120, "Will the index hold a half percent gain?"],
  ["GME", 1.03, false, 120, "Will GME squeeze 3% before the bell?"],
];

async function main() {
  const [deployer] = await ethers.getSigners();
  await network.provider.send("anvil_impersonateAccount", [WHALE]);
  await network.provider.send("anvil_setBalance", [WHALE, "0x" + (10n ** 18n).toString(16)]);

  const wif = new ethers.Contract(WIF, WIF_ABI, deployer);
  const wifRO = new ethers.Contract(WIF, WIF_ABI, ethers.provider);

  // fund + approve the deployer for the creation fees
  const data = wif.interface.encodeFunctionData("transfer", [deployer.address, FEE * 8n]);
  await network.provider.send("eth_sendTransaction", [{ from: WHALE, to: WIF, data, gas: "0x7a120" }]);
  console.log(`deployer wif ${ethers.formatUnits(await wifRO.balanceOf(deployer.address), 18)}`);

  const fb = await (await ethers.getContractFactory("FlatBets")).deploy(WIF, FEE);
  await fb.waitForDeployment();
  const address = await fb.getAddress();
  console.log(`FlatBets ${address}`);
  console.log(`deploy tx ${fb.deploymentTransaction()!.hash}`);
  await (await wif.approve(address, FEE * 8n)).wait();

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;

  for (const [sym, factor, lte, mins, question] of SLATE) {
    const feed = new ethers.Contract(FEEDS[sym as keyof typeof FEEDS], FEED_ABI, ethers.provider);
    const [, answer] = await feed.latestRoundData();
    const d = Number(await feed.decimals());
    const threshold = lte
      ? (answer * BigInt(Math.round(factor * 1e4))) / 10000n
      : (answer * BigInt(Math.round(factor * 1e4))) / 10000n;

    const rule =
      `YES if the Chainlink ${sym}/USD aggregator on Robinhood Chain prints ` +
      `${lte ? "at or below" : "at or above"} ${ethers.formatUnits(threshold, d)} on the first round ` +
      `published after the cutoff (${new Date((now + mins * 60) * 1000).toISOString()}). ` +
      `Resolution is pinned to that round, so nobody can pick a friendlier print later. Otherwise NO.`;

    const tx = await fb.createMarket(
      question,
      rule,
      now + mins * 60,
      now + mins * 60 + 300,
      1,
      lte,
      FEEDS[sym as keyof typeof FEEDS],
      threshold,
      deployer.address,
    );
    const rc = await tx.wait();
    console.log(
      `market ${sym.padEnd(4)} ${lte ? "<=" : ">="} ${ethers.formatUnits(threshold, d).padStart(9)} ` +
      `closes +${mins}m  ${rc!.hash}`,
    );
  }

  // --- demo stakes, so a fresh clone renders real pools and real burn -------
  const [, alice, bob, carol] = await ethers.getSigners();
  const BANK = ethers.parseUnits("6000", 18);
  for (const s of [alice, bob, carol]) {
    const d = wif.interface.encodeFunctionData("transfer", [s.address, BANK]);
    await network.provider.send("eth_sendTransaction", [{ from: WHALE, to: WIF, data: d, gas: "0x7a120" }]);
    await (await wif.connect(s).approve(address, ethers.MaxUint256)).wait();
    console.log(`funded ${s.address} ${ethers.formatUnits(await wifRO.balanceOf(s.address), 18)} WIF`);
  }

  // [signer, marketId, side (1 yes / 2 no), wif]
  const BETS: Array<[0 | 1 | 2, number, 1 | 2, string]> = [
    [0, 0, 1, "1200"],
    [1, 0, 2, "800"],
    [2, 0, 1, "450"],
    [0, 1, 2, "900"],
    [1, 1, 2, "600"],
    [2, 1, 1, "250"],
    [1, 2, 1, "1500"],
    [2, 2, 2, "500"],
    [0, 3, 2, "700"],
    [2, 4, 1, "250"],
    [1, 4, 2, "1100"],
    [0, 5, 1, "1800"],
    [2, 5, 2, "320"],
  ];
  for (const [who, id, side, amount] of BETS) {
    const signer = [alice, bob, carol][who];
    const tx = await fb.connect(signer).bet(id, side, ethers.parseUnits(amount, 18));
    await tx.wait();
    console.log(`bet market ${id} ${side === 1 ? "YES" : "NO "} ${amount.padStart(5)} WIF  ${signer.address}`);
  }

  for (let id = 0; id < SLATE.length; id++) {
    const m = await fb.getMarket(id);
    console.log(
      `pools market ${id}: yes ${ethers.formatUnits(m.yesPool, 18).padStart(9)}  ` +
        `no ${ethers.formatUnits(m.noPool, 18).padStart(9)}  burned ${ethers.formatUnits(m.burned, 18)}`,
    );
  }

  const stats = await fb.stats();
  console.log(`markets ${stats.markets_} burned ${ethers.formatUnits(stats.burned_, 18)} WIF`);
  console.log(`\nVITE_FLATBETS_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
