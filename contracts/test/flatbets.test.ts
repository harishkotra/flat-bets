import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";


const WIF = (n: string | number) => ethers.parseUnits(String(n), 18);
const BURN = "0x000000000000000000000000000000000000dEaD";
const Kind = { Manual: 0, Feed: 1 };
const Side = { Open: 0, Yes: 1, No: 2, Void: 3 };

describe("FlatBets", () => {
  let wif: MockWIF;
  let fb: FlatBets;
  let feed: MockFeed;
  let owner: any, resolver: any, alice: any, bob: any, carol: any;

  const CREATE_FEE = WIF(500);

  beforeEach(async () => {
    [owner, resolver, alice, bob, carol] = await ethers.getSigners();
    wif = await (await ethers.getContractFactory("MockWIF")).deploy();
    fb = await (await ethers.getContractFactory("FlatBets")).deploy(await wif.getAddress(), CREATE_FEE);
    feed = await (await ethers.getContractFactory("MockFeed")).deploy(8, 220_00000000n);
    for (const s of [owner, resolver, alice, bob, carol]) {
      await wif.mint(s.address, WIF(1_000_000));
      await wif.connect(s).approve(await fb.getAddress(), ethers.MaxUint256);
    }
  });

  async function newMarket(kind = Kind.Manual, threshold = 200_00000000n, minutes = 60) {
    const now = await time.latest();
    return fb.createMarket(
      "Will NVDA close above $200 on Friday?",
      "YES if the Chainlink NVDA/USD feed prints >= 200e8 at any point after the resolve time.",
      now + minutes * 60,
      now + minutes * 60 + 60,
      kind,
      false,
      kind === Kind.Feed ? await feed.getAddress() : ethers.ZeroAddress,
      kind === Kind.Feed ? threshold : 0,
      resolver.address,
    );
  }

  it("burns the creation fee and records the market", async () => {
    const before = await wif.balanceOf(BURN);
    await expect(newMarket()).to.emit(fb, "MarketCreated");
    expect(await wif.balanceOf(BURN)).to.equal(before + CREATE_FEE);
    const m = await fb.getMarket(0);
    expect(m.question).to.equal("Will NVDA close above $200 on Friday?");
    expect(m.outcome).to.equal(Side.Open);
    expect(await fb.marketCount()).to.equal(1);
  });

  it("burns 2% of every stake and pools the net", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(1000));
    const m = await fb.getMarket(0);
    expect(m.yesPool).to.equal(WIF(980));
    expect(m.burned).to.equal(WIF(20));
    expect(await fb.totalBurned()).to.equal(WIF(20) + CREATE_FEE);
    expect(await fb.totalStaked()).to.equal(WIF(980));
  });

  it("splits the pool pro rata between winners", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(1000)); // 980 net
    await fb.connect(bob).bet(0, Side.Yes, WIF(3000)); // 2940 net
    await fb.connect(carol).bet(0, Side.No, WIF(2000)); // 1960 net
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);

    const pool = WIF(980) + WIF(2940) + WIF(1960);
    expect(await fb.payoutOf(0, alice.address)).to.equal((WIF(980) * pool) / WIF(3920));
    expect(await fb.payoutOf(0, carol.address)).to.equal(0);

    const aliceBefore = await wif.balanceOf(alice.address);
    await fb.connect(alice).claim(0);
    expect((await wif.balanceOf(alice.address)) - aliceBefore).to.equal((WIF(980) * pool) / WIF(3920));
    await expect(fb.connect(alice).claim(0)).to.be.revertedWithCustomError(fb, "AlreadyClaimed");
  });

  it("refunds both sides on a void, minus the burn", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(500));
    await fb.connect(bob).bet(0, Side.No, WIF(700));
    await time.increase(61 * 60);
    await fb.connect(resolver).voidMarket(0);
    expect(await fb.payoutOf(0, alice.address)).to.equal(WIF(490));
    const before = await wif.balanceOf(bob.address);
    await fb.connect(bob).claim(0);
    expect((await wif.balanceOf(bob.address)) - before).to.equal(WIF(686));
  });

  it("refunds everyone if one side is empty", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(100));
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    expect(await fb.payoutOf(0, alice.address)).to.equal(WIF(98));
  });

  it("settles a feed market at or above the threshold", async () => {
    await newMarket(Kind.Feed, 200_00000000n);
    await fb.connect(alice).bet(0, Side.Yes, WIF(100));
    await time.increase(61 * 60);
    await feed.set(220_00000000n, await time.latest());
    await expect(fb.connect(bob).resolveWithFeed(0, await feed.roundId())).to.emit(fb, "MarketResolved");
    const m = await fb.getMarket(0);
    expect(m.outcome).to.equal(Side.Yes);
    expect(m.observedAnswer).to.equal(220_00000000n);
    expect(m.observedAt).to.be.greaterThan(0);
  });

  it("settles NO when the feed prints below the threshold", async () => {
    await newMarket(Kind.Feed, 200_00000000n);
    await fb.connect(alice).bet(0, Side.No, WIF(100));
    await time.increase(61 * 60);
    await feed.set(199_99000000n, await time.latest());
    await fb.connect(bob).resolveWithFeed(0, await feed.roundId());
    expect((await fb.getMarket(0)).outcome).to.equal(Side.No);
  });

  it("refuses a round printed before the cutoff", async () => {
    await newMarket(Kind.Feed, 200_00000000n);
    const before = await feed.roundId();
    await time.increase(61 * 60);
    await expect(fb.connect(bob).resolveWithFeed(0, before)).to.be.revertedWithCustomError(fb, "TooEarly");
  });

  it("refuses a non-positive feed answer", async () => {
    await newMarket(Kind.Feed, 200_00000000n);
    await time.increase(61 * 60);
    await feed.set(0, await time.latest());
    await expect(fb.connect(bob).resolveWithFeed(0, await feed.roundId())).to.be.revertedWithCustomError(
      fb,
      "BadFeedAnswer",
    );
  });

  it("pins settlement to the FIRST round after the cutoff", async () => {
    await newMarket(Kind.Feed, 200_00000000n);
    await time.increase(61 * 60);
    await feed.set(210_00000000n, await time.latest()); // first round after cutoff
    const first = await feed.roundId();
    await time.increase(600);
    await feed.set(150_00000000n, await time.latest()); // a later, friendlier round
    await expect(fb.connect(bob).resolveWithFeed(0, await feed.roundId())).to.be.revertedWithCustomError(
      fb,
      "NotFirstRound",
    );
    await fb.connect(bob).resolveWithFeed(0, first);
    const m = await fb.getMarket(0);
    expect(m.outcome).to.equal(Side.Yes);
    expect(m.observedAnswer).to.equal(210_00000000n);
  });

  it("enforces timing, resolver and double-settlement guards", async () => {
    await newMarket();
    await expect(fb.connect(alice).resolveManual(0, Side.Yes)).to.be.revertedWithCustomError(fb, "NotResolver");
    await time.increase(61 * 60);
    await expect(fb.connect(alice).bet(0, Side.Yes, WIF(1))).to.be.revertedWithCustomError(fb, "BettingClosed");
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    await expect(fb.connect(resolver).resolveManual(0, Side.No)).to.be.revertedWithCustomError(fb, "AlreadyResolved");
    await expect(fb.connect(resolver).voidMarket(0)).to.be.revertedWithCustomError(fb, "AlreadyResolved");
  });

  it("previewPayout matches what claim actually pays", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(1000));
    await fb.connect(bob).bet(0, Side.No, WIF(4000));
    const gross = WIF(1000);
    const preview = await fb.previewPayout(0, Side.Yes, gross);
    await fb.connect(carol).bet(0, Side.Yes, gross);
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    const owed = await fb.payoutOf(0, carol.address);
    const before = await wif.balanceOf(carol.address);
    await fb.connect(carol).claim(0);
    const got = (await wif.balanceOf(carol.address)) - before;
    expect(got).to.equal(owed);
    expect(got).to.equal(preview.payoutIfWin);
    expect(got).to.be.greaterThan(preview.net);
  });

  it("pays nothing to a bettor on the losing side", async () => {
    await newMarket();
    await fb.connect(alice).bet(0, Side.Yes, WIF(100));
    await fb.connect(bob).bet(0, Side.No, WIF(300));
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    expect(await fb.payoutOf(0, bob.address)).to.equal(0);
  });

  it("never pays out more than the pool, even with odd amounts", async () => {
    await newMarket();
    const amounts = [12345678901234567n, 999999999999999999n, 3n, 777777777777777777n];
    await fb.connect(alice).bet(0, Side.Yes, amounts[0]);
    await fb.connect(bob).bet(0, Side.Yes, amounts[1]);
    await fb.connect(carol).bet(0, Side.No, amounts[2]);
    await fb.connect(owner).bet(0, Side.No, amounts[3]);
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    const m = await fb.getMarket(0);
    const total = m.yesPool + m.noPool;
    const a = await fb.payoutOf(0, alice.address);
    const b = await fb.payoutOf(0, bob.address);
    expect(a + b).to.be.lessThanOrEqual(total);
    expect(total - (a + b)).to.be.lessThan(10n); // only integer dust stays behind
  });

  it("lets the owner tune the creation fee and refuses non-owners", async () => {
    await fb.setCreationFee(WIF(1000));
    expect(await fb.creationFee()).to.equal(WIF(1000));
    await expect(fb.connect(alice).setCreationFee(WIF(1))).to.be.revertedWithCustomError(fb, "NotOwner");
    await expect(fb.setCreationFee(WIF(1_000_000))).to.be.revertedWithCustomError(fb, "FeeTooHigh");
  });

  it("claimMany sweeps several resolved markets at once", async () => {
    await newMarket();
    await newMarket(Kind.Feed, 200_00000000n);
    await fb.connect(alice).bet(0, Side.Yes, WIF(100));
    await fb.connect(alice).bet(1, Side.Yes, WIF(100));
    await fb.connect(bob).bet(0, Side.No, WIF(100));
    await fb.connect(bob).bet(1, Side.No, WIF(100));
    await time.increase(61 * 60);
    await fb.connect(resolver).resolveManual(0, Side.Yes);
    await feed.set(250_00000000n, await time.latest());
    await fb.connect(resolver).resolveWithFeed(1, await feed.roundId());
    const before = await wif.balanceOf(alice.address);
    await fb.connect(alice).claimMany([0, 1]);
    expect((await wif.balanceOf(alice.address)) - before).to.be.greaterThan(WIF(190));
  });

  it("exposes a markets page for the frontend", async () => {
    await newMarket();
    await newMarket(Kind.Feed, 200_00000000n);
    const page = await fb.markets(0, 10);
    expect(page.length).to.equal(2);
    expect(page[1].kind).to.equal(Kind.Feed);
  });
});
