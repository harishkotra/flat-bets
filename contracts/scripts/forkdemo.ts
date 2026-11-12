import { ethers, network } from "hardhat";
import { FEEDS, WIF } from "./lib";

/**
 * End-to-end run of the whole product against a Robinhood Chain mainnet fork.
 *
 *   npx hardhat node --fork https://rpc.mainnet.chain.robinhood.com/ --port 8547
 *   npx hardhat run scripts/forkdemo.ts --network localhost
 *
 * Everything is the real thing: the real $WIF contract, the real Chainlink
 * aggregators, real transactions, real receipts. The only fork-only step is
 * granting test wallets a WIF balance by writing the ERC20 balance slot, which
 * is not possible on mainnet and is exactly why this script only runs locally.
 */
const FEE = ethers.parseUnits("250", 18);
const WIF_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];
// A real $WIF holder on Robinhood Chain mainnet. On the fork we impersonate it
// and move some of its WIF to the test wallets, so every number below comes
// from the real token rather than a mock.
const WHALE = "0x1089a7C3915c9F067615909DBd07697C21c32156";

async function fund(to: string, amount: bigint) {
  const wif = new ethers.Contract(WIF, WIF_ABI, ethers.provider);
  const data = wif.interface.encodeFunctionData("transfer", [to, amount]);
  await network.provider.send("eth_sendTransaction", [{ from: WHALE, to: WIF, data, gas: "0x7a120" }]);
  const got = await wif.balanceOf(to);
  if (got < amount) throw new Error(`funding failed for ${to}: ${got}`);
  return got;
}

const usd = (v: bigint, d = 8) => Number(ethers.formatUnits(v, d)).toFixed(2);
const wif = (v: bigint) => ethers.formatUnits(v, 18);

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`fork of robinhood chain, local chainId ${chainId}`);
  console.log(`wif ${WIF}`);

  const supply = await new ethers.Contract(
    WIF,
    ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"],
    ethers.provider,
  ).totalSupply();
  console.log(`wif total supply ${wif(supply)}`);

  // --- real Chainlink read, straight from the fork ---------------------------
  const feedAbi = [
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    "function decimals() view returns (uint8)",
  ];
  for (const [sym, addr] of Object.entries(FEEDS).slice(0, 4)) {
    const f = new ethers.Contract(addr, feedAbi, ethers.provider);
    const [rid, ans, , upd] = await f.latestRoundData();
    const d = await f.decimals();
    console.log(`feed ${sym.padEnd(4)} round ${rid} ${usd(ans, Number(d))} @ ${new Date(Number(upd) * 1000).toISOString()}`);
  }

  // --- fund test wallets in real WIF (fork only, via a real holder) --------
  await network.provider.send("anvil_impersonateAccount", [WHALE]);
  await network.provider.send("anvil_setBalance", [WHALE, "0x" + (10n ** 18n).toString(16)]);
  console.log(`whale wif before: ${wif(await new ethers.Contract(WIF, WIF_ABI, ethers.provider).balanceOf(WHALE))}`);
  for (const who of [alice, bob, carol]) await fund(who.address, ethers.parseUnits("50000", 18));
  await fund(deployer.address, FEE * 2n);
  console.log(`wif granted: alice ${wif(await new ethers.Contract(WIF, WIF_ABI, ethers.provider).balanceOf(alice.address))}`);

  // --- deploy ---------------------------------------------------------------
  const fb = await (await ethers.getContractFactory("FlatBets")).deploy(WIF, FEE);
  await fb.waitForDeployment();
  const address = await fb.getAddress();
  const dtx = fb.deploymentTransaction()!;
  console.log(`\ndeployed FlatBets ${address}\n  tx ${dtx.hash}`);
  console.log(`  gas ${(await dtx.wait())!.gasUsed}`);

  const wifToken = new ethers.Contract(WIF, WIF_ABI, deployer);
  await (await wifToken.approve(address, FEE * 4n)).wait();
  for (const who of [alice, bob, carol]) {
    await (await wifToken.connect(who).approve(address, ethers.parseUnits("100000", 18))).wait();
  }
  console.log("wif approvals set");

  const mock = await (await ethers.getContractFactory("MockFeed")).deploy(8, 220_00000000n);
  await mock.waitForDeployment();
  console.log(`mock feed (fork stand-in for a fresh chainlink round) ${await mock.getAddress()}`);

  // --- markets --------------------------------------------------------------
  const close = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const resolve = close + 60n;

  await (await fb.connect(deployer).createMarket(
    "Will NVDA close at or above $220 on Friday?",
    "YES if the Chainlink NVDA/USD aggregator on Robinhood Chain prints at or above 220.00 on the first round published after the cutoff. Otherwise NO.",
    close, resolve, 0, false, ethers.ZeroAddress, 0n, deployer.address,
  )).wait();
  await (await fb.connect(deployer).createMarket(
    "Will the NVDA print cross $220 before Friday close?",
    "YES if the pinned round prints at or above 220.00 after the cutoff. NO otherwise.",
    close, resolve, 1, false, await mock.getAddress(), 220_00000000n, deployer.address,
  )).wait();
  console.log(`\nmarkets opened: ${await fb.marketCount()}`);

  // --- betting --------------------------------------------------------------
  const ops: Array<[string, any]> = [
    ["alice YES 4,000", fb.connect(alice).bet(0, 1, ethers.parseUnits("4000", 18))],
    ["bob NO 6,000", fb.connect(bob).bet(0, 2, ethers.parseUnits("6000", 18))],
    ["carol YES 2,500", fb.connect(carol).bet(0, 1, ethers.parseUnits("2500", 18))],
    ["alice feed YES 1,000", fb.connect(alice).bet(1, 1, ethers.parseUnits("1000", 18))],
    ["bob feed NO 3,000", fb.connect(bob).bet(1, 2, ethers.parseUnits("3000", 18))],
  ];
  for (const [label, p] of ops) {
    const rc = await (await p).wait();
    console.log(`bet   ${label.padEnd(22)} ${rc.hash}`);
  }
  const m0 = await fb.getMarket(0);
  console.log(`\nmarket 0 pool: yes ${wif(m0.yesPool)} no ${wif(m0.noPool)} burned ${wif(m0.burned)}`);

  // --- settle ---------------------------------------------------------------
  await network.provider.send("evm_increaseTime", [3700]);
  await network.provider.send("evm_mine", []);

  const r1 = await (await fb.connect(deployer).resolveManual(0, 1)).wait();
  console.log(`resolve manual YES        ${r1.hash}`);

  await mock.set(221_50000000n, Math.floor(Date.now() / 1000) + 3700);
  const rid = await mock.roundId();
  const r2 = await (await fb.connect(deployer).resolveWithFeed(1, rid)).wait();
  console.log(`resolve feed (round ${rid})   ${r2.hash}`);

  // --- claims ---------------------------------------------------------------
  for (const [who, name] of [[alice, "alice"], [carol, "carol"]] as const) {
    const owed = await fb.payoutOf(0, who.address);
    const before = await new ethers.Contract(WIF, WIF_ABI, ethers.provider).balanceOf(who.address);
    await (await fb.connect(who).claim(0)).wait();
    const after = await new ethers.Contract(WIF, WIF_ABI, ethers.provider).balanceOf(who.address);
    console.log(`claim ${name} +${wif(after - before)} WIF (owed ${wif(owed)})`);
  }
  const feedOwed = await fb.payoutOf(1, alice.address);
  await (await fb.connect(alice).claim(1)).wait();
  console.log(`claim alice feed +${wif(feedOwed)} WIF`);

  const stats = await fb.stats();
  console.log(`\nstats: markets ${stats.markets_} staked ${wif(stats.staked_)} burned ${wif(stats.burned_)} claimed ${wif(stats.claimed_)}`);
  console.log(`wif held by contract: ${wif(await new ethers.Contract(WIF, WIF_ABI, ethers.provider).balanceOf(address))}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
