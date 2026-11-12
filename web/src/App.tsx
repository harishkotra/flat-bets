import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";
import {
  CONFIGURED,
  FLATBETS,
  FLATBETS_ABI,
  WIF,
  CHAIN_ID,
  WIF_ABI,
  connectWallet,
  explorerTx,
  fmtFull,
  fmtPrice,
  fmtWif,
  publicClient,
  shortAddr,
  toMarket,
  walletClient,
  type Market,
  type Position,
} from "./lib";

type Row = { m: Market; pos: Position | null };
type Live = { answer: bigint; updatedAt: number; decimals: number } | null;

const EMPTY_POS: Position = { yes: 0n, no: 0n, claimed: false, claimable: 0n };

function useCountdown(ts: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = Math.floor(Date.now() / 1000);
  const d = ts - now;
  if (d <= 0) return "closed";
  const days = Math.floor(d / 86400);
  const hrs = Math.floor((d % 86400) / 3600);
  const min = Math.floor((d % 3600) / 60);
  if (days) return `${days}d ${hrs}h left`;
  if (hrs) return `${hrs}h ${min}m left`;
  return `${min}m left`;
}

function Countdown({ ts }: { ts: number }) {
  const label = useCountdown(ts);
  return <>{label}</>;
}

const sideName = (s: number) => (s === 1 ? "YES" : "NO");
const outcomeName = (o: number) => (o === 1 ? "YES" : o === 2 ? "NO" : o === 3 ? "VOID" : "OPEN");

function yesShare(m: Market) {
  const t = m.yesPool + m.noPool;
  if (t === 0n) return 50;
  return Number((m.yesPool * 10000n) / t) / 100;
}

function oddOf(pool: bigint, other: bigint) {
  const t = pool + other;
  if (pool === 0n) return "—";
  return `${(Number(t) / Number(pool)).toFixed(2)}×`;
}

export default function App() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<{ staked: bigint; burned: bigint } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [side, setSide] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint>(0n);
  const [live, setLive] = useState<Live>(null);
  const [preview, setPreview] = useState<{ net: bigint; burned: bigint; payout: bigint } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [claimable, setClaimable] = useState<bigint>(0n);

  const load = useCallback(async () => {
    if (!CONFIGURED) return;
    try {
      const [count, st] = await Promise.all([
        publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "marketCount" }) as Promise<bigint>,
        publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "stats" }) as Promise<any>,
      ]);
      const n = Number(count);
      const ids = Array.from({ length: n }, (_, i) => n - 1 - i);
      const markets = await Promise.all(
        ids.map((id) =>
          publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "getMarket", args: [BigInt(id)] }),
        ),
      );
      const built: Row[] = markets.map((raw, i) => ({ m: toMarket(ids[i], raw as any), pos: null }));
      setRows(built);
      setStats({ staked: BigInt(st[1]), burned: BigInt(st[2]) });
      setSel((cur) => (cur === null ? (built[0]?.m.id ?? null) : cur));
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? "Could not read the market board.");
    }
  }, []);

  const loadUser = useCallback(
    async (who: Address) => {
      try {
        const [balance, count] = await Promise.all([
          publicClient.readContract({ address: WIF, abi: WIF_ABI, functionName: "balanceOf", args: [who] }) as Promise<bigint>,
          publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "marketCount" }) as Promise<bigint>,
        ]);
        setBal(balance);
        const n = Number(count);
        const ids = Array.from({ length: n }, (_, i) => i);
        const [positions, payouts] = await Promise.all([
          Promise.all(
            ids.map((id) =>
              publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "position", args: [BigInt(id), who] }) as Promise<any>,
            ),
          ),
          Promise.all(
            ids.map((id) =>
              publicClient.readContract({ address: FLATBETS, abi: FLATBETS_ABI, functionName: "payoutOf", args: [BigInt(id), who] }) as Promise<bigint>,
            ),
          ),
        ]);
        const byId = new Map<number, Position>();
        ids.forEach((id, i) => {
          const p = positions[i];
          byId.set(id, {
            yes: BigInt(p[0] ?? p.yes),
            no: BigInt(p[1] ?? p.no),
            claimed: Boolean(p[2] ?? p.isClaimed),
            claimable: BigInt(payouts[i]),
          });
        });
        setRows((cur) => (cur ? cur.map((r) => ({ ...r, pos: byId.get(r.m.id) ?? EMPTY_POS })) : cur));
        setClaimable([...byId.values()].reduce((a, p) => a + p.claimable, 0n));
      } catch {
        /* wallet reads are best effort */
      }
    },
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!account) return;
    loadUser(account);
    const t = setInterval(() => loadUser(account), 9000);
    return () => clearInterval(t);
  }, [account, loadUser]);

  const selected = useMemo(() => rows?.find((r) => r.m.id === sel) ?? null, [rows, sel]);

  useEffect(() => {
    let dead = false;
    setLive(null);
    if (!selected || selected.m.kind !== 1) return;
    const read = async () => {
      try {
        const r = (await publicClient.readContract({
          address: FLATBETS,
          abi: FLATBETS_ABI,
          functionName: "liveFeed",
          args: [BigInt(selected.m.id)],
        })) as any;
        if (!dead) setLive({ answer: BigInt(r[0]), updatedAt: Number(r[1]), decimals: Number(r[2]) });
      } catch {
        if (!dead) setLive(null);
      }
    };
    read();
    const t = setInterval(read, 15000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [selected?.m.id, selected?.m.kind]);

  useEffect(() => {
    let dead = false;
    setPreview(null);
    const amt = Number(amount);
    if (!selected || !CONFIGURED || !(amt > 0)) return;
    const v = parseUnits(amount, 18);
    publicClient
      .readContract({
        address: FLATBETS,
        abi: FLATBETS_ABI,
        functionName: "previewPayout",
        args: [BigInt(selected.m.id), side, v],
      })
      .then((r: any) => {
        if (!dead) setPreview({ net: BigInt(r[0]), burned: BigInt(r[1]), payout: BigInt(r[2]) });
      })
      .catch(() => {
        if (!dead) setPreview(null);
      });
    return () => {
      dead = true;
    };
  }, [amount, side, selected?.m.id, selected?.m.yesPool, selected?.m.noPool]);

  async function doConnect() {
    setErr(null);
    try {
      const addr = await connectWallet();
      setAccount(addr);
      loadUser(addr);
    } catch (e: any) {
      setErr(e?.message ?? "Wallet connection failed.");
    }
  }

  async function place() {
    if (!account || !selected) return;
    setErr(null);
    setOk(null);
    setBusy("bet");
    try {
      const wc = walletClient(account);
      const v = parseUnits(amount, 18);
      if (v > bal) throw new Error("Not enough WIF in this wallet.");
      const allowance = (await publicClient.readContract({
        address: WIF,
        abi: WIF_ABI,
        functionName: "allowance",
        args: [account, FLATBETS],
      })) as bigint;
      if (allowance < v) {
        const h = await wc.writeContract({
          address: WIF,
          abi: WIF_ABI,
          functionName: "approve",
          args: [FLATBETS, maxUint256],
          chain: wc.chain,
          account,
        } as any);
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      const hash = await wc.writeContract({
        address: FLATBETS,
        abi: FLATBETS_ABI,
        functionName: "bet",
        args: [BigInt(selected.m.id), side, v],
        chain: wc.chain,
        account,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash });
      setOk(`Bet placed. ${explorerTx(hash)}`);
      setAmount("");
      await load();
      await loadUser(account);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? "Bet failed.");
    } finally {
      setBusy(null);
    }
  }

  async function claim(id: number) {
    if (!account) return;
    setErr(null);
    setOk(null);
    setBusy(`claim-${id}`);
    try {
      const wc = walletClient(account);
      const hash = await wc.writeContract({
        address: FLATBETS,
        abi: FLATBETS_ABI,
        functionName: "claim",
        args: [BigInt(id)],
        chain: wc.chain,
        account,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash });
      setOk(`Claimed. ${explorerTx(hash)}`);
      await load();
      await loadUser(account);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? "Claim failed.");
    } finally {
      setBusy(null);
    }
  }

  const m = selected?.m;
  const open = m ? m.outcome === 0 && m.closeTime * 1000 > Date.now() : false;
  const share = m ? yesShare(m) : 50;
  const spot = live && m ? `${fmtPrice(live.answer, live.decimals)}` : null;
  const threshold = m ? fmtPrice(m.threshold, m.feedDecimals) : "";

  return (
    <>
      <header className="hdr">
        <div className="wrap hdr-in">
          <h1 className="wordmark">
            Flat Bets<span>.</span>
          </h1>
          <div className="hdr-meta">
            <span className="meta-item">Robinhood Chain · {CHAIN_ID}</span>
            <span className="meta-item">
              WIF burned <b>{stats ? fmtWif(stats.burned) : "—"}</b>
            </span>
            <span className="meta-item">
              pooled <b>{stats ? fmtWif(stats.staked) : "—"}</b> WIF
            </span>
            <button className="connect" onClick={doConnect} data-on={account ? "1" : "0"}>
              {account ? shortAddr(account) : "Connect wallet"}
            </button>
          </div>
        </div>
      </header>

      {!CONFIGURED && (
        <div className="wrap">
          <p className="err" style={{ padding: "12px 0" }}>
            Contract address missing: set VITE_FLATBETS_ADDRESS before building.
          </p>
        </div>
      )}

      <section className="stage">
        <div className="wrap">
          {m ? (
            <>
              <div className="kicker">
                <span className="dot" />
                <span>Market {m.id}</span>
                <span>·</span>
                <span>{m.kind === 1 ? "chainlink settled" : "resolver settled"}</span>
                <span>·</span>
                <span>{m.outcome === 0 ? <Countdown ts={m.closeTime} /> : outcomeName(m.outcome)}</span>
              </div>
              <h2 className="q">{m.question}</h2>
              <div className="bar" role="img" aria-label={`YES pool ${share.toFixed(1)} percent, NO pool ${(100 - share).toFixed(1)} percent`}>
                <div className="bar-yes" style={{ width: `${share}%` }} />
                <div className="bar-no" style={{ width: `${100 - share}%` }} />
              </div>
              <div className="bar-lbl">
                <span>
                  <b>YES</b> {share.toFixed(1)}% · {oddOf(m.yesPool, m.noPool)}
                </span>
                <span>
                  {oddOf(m.noPool, m.yesPool)} · <b>NO</b> {(100 - share).toFixed(1)}%
                </span>
              </div>

              <dl className="figs">
                <div className="fig">
                  <dt>Pool</dt>
                  <dd>
                    {fmtWif(m.yesPool + m.noPool)} <small>WIF</small>
                  </dd>
                </div>
                <div className="fig">
                  <dt>Burned on this market</dt>
                  <dd>
                    {fmtWif(m.burned)} <small>WIF</small>
                  </dd>
                </div>
                <div className="fig">
                  <dt>{m.kind === 1 ? (m.lte ? "Settles at or below" : "Settles at or above") : "Bettors"}</dt>
                  <dd>
                    {m.kind === 1 ? threshold : Number(m.bettors)}
                    {m.kind === 1 && <small>USD</small>}
                  </dd>
                </div>
                <div className="fig">
                  <dt>{m.kind === 1 ? "Live price" : "Cutoff"}</dt>
                  <dd>
                    {m.kind === 1 ? (spot ?? "—") : new Date(m.closeTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {m.kind === 1 && live && <small>{new Date(live.updatedAt * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</small>}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="empty">Loading the board…</p>
          )}
        </div>
      </section>

      <div className="wrap cols">
        <main>
          <div className="board-hd">
            <h2>Open sheet</h2>
            <span className="meta-item">{rows ? `${rows.length} markets` : "—"}</span>
          </div>
          {rows === null ? (
            <>
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </>
          ) : rows.length === 0 ? (
            <p className="empty">No markets yet. The board is seeded by the operator.</p>
          ) : (
            rows.map(({ m: mk, pos }) => {
              const mine = pos ? pos.yes + pos.no : 0n;
              const canClaim = pos && pos.claimable > 0n && !pos.claimed;
              return (
                <div
                  key={mk.id}
                  className="row"
                  data-sel={mk.id === sel ? "1" : "0"}
                  onClick={() => setSel(mk.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSel(mk.id);
                  }}
                >
                  <span className="row-idx">{String(mk.id).padStart(2, "0")}</span>
                  <div>
                    <p className="row-q">{mk.question}</p>
                    <div className="row-meta">
                      {mk.outcome === 0 ? (
                        <span className="live">
                          <Countdown ts={mk.closeTime} />
                        </span>
                      ) : (
                        <span>{outcomeName(mk.outcome)}</span>
                      )}
                      <span>{fmtWif(mk.yesPool + mk.noPool)} WIF pooled</span>
                      {mine > 0n && <span>you {fmtWif(mine)}</span>}
                      {canClaim && <span style={{ color: "var(--signal)" }}>{fmtWif(pos!.claimable)} to claim</span>}
                    </div>
                    <div className="mini">
                      <div className="bar-yes" style={{ width: `${yesShare(mk)}%` }} />
                      <div className="bar-no" style={{ width: `${100 - yesShare(mk)}%` }} />
                    </div>
                  </div>
                  <div className="row-side">
                    {mk.outcome === 0 ? (
                      <>
                        <button className="pill" onClick={(e) => { e.stopPropagation(); setSel(mk.id); setSide(1); }}>
                          YES
                        </button>
                        <button className="pill" data-side="no" onClick={(e) => { e.stopPropagation(); setSel(mk.id); setSide(2); }}>
                          NO
                        </button>
                      </>
                    ) : canClaim ? (
                      <button
                        className="pill"
                        disabled={busy === `claim-${mk.id}`}
                        onClick={(e) => { e.stopPropagation(); claim(mk.id); }}
                      >
                        {busy === `claim-${mk.id}` ? "Claiming…" : "Claim"}
                      </button>
                    ) : (
                      <span className="verdict" data-o={mk.outcome}>
                        {outcomeName(mk.outcome)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </main>

        <aside className="slip">
          <div className="slip-hd">
            <h2>Bet slip</h2>
            <span className="slip-sel">{m ? `#${String(m.id).padStart(2, "0")}` : "—"}</span>
          </div>
          {!m ? (
            <p className="note">Pick a market to open a slip.</p>
          ) : (
            <>
              <p className="slip-q">{m.question}</p>
              <div className="sides">
                <button className="side" data-on={side === 1 ? "1" : "0"} onClick={() => setSide(1)} disabled={!open}>
                  <b>YES</b>
                  <span>{oddOf(m.yesPool, m.noPool)}</span>
                </button>
                <button className="side" data-on={side === 2 ? "1" : "0"} onClick={() => setSide(2)} disabled={!open}>
                  <b>NO</b>
                  <span>{oddOf(m.noPool, m.yesPool)}</span>
                </button>
              </div>

              <div className="amt">
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="Stake amount in WIF"
                  disabled={!open}
                />
                <span className="unit">WIF</span>
              </div>
              <div className="chips">
                {["100", "1000", "5000", "10000"].map((c) => (
                  <button key={c} className="chip" onClick={() => setAmount(c)} disabled={!open}>
                    {Number(c).toLocaleString("en-US")}
                  </button>
                ))}
                {account && bal > 0n && (
                  <button className="chip" onClick={() => setAmount(formatUnits(bal, 18))} disabled={!open}>
                    max
                  </button>
                )}
              </div>

              <div className="tally">
                <div>
                  <span>Side</span>
                  <span className="strong">{sideName(side)}</span>
                </div>
                <div>
                  <span>Burn, 2%</span>
                  <span className="burn">{preview ? `${fmtFull(preview.burned, 4)} WIF` : "—"}</span>
                </div>
                <div>
                  <span>Into pool</span>
                  <span>{preview ? `${fmtFull(preview.net, 4)} WIF` : "—"}</span>
                </div>
                <div>
                  <span>Returns if right</span>
                  <span className="strong">{preview ? `${fmtFull(preview.payout)} WIF` : "—"}</span>
                </div>
                <div>
                  <span>Your position</span>
                  <span>
                    {selected?.pos && selected.pos.yes + selected.pos.no > 0n
                      ? fmtFull(selected.pos.yes + selected.pos.no)
                      : "—"} WIF
                  </span>
                </div>
              </div>

              {!account ? (
                <button className="cta" onClick={doConnect}>
                  Connect wallet to bet
                </button>
              ) : !open ? (
                <button className="cta" disabled>
                  {m.outcome === 0 ? "Betting closed" : `Settled ${outcomeName(m.outcome)}`}
                </button>
              ) : (
                <button className="cta" onClick={place} disabled={!!busy || !(Number(amount) > 0)}>
                  {busy === "bet" ? "Confirming…" : `Bet ${amount || "0"} WIF on ${sideName(side)}`}
                </button>
              )}

              {claimable > 0n && (
                <button className="cta ghost" onClick={() => {
                  const ids = (rows ?? []).filter((r) => r.pos && r.pos.claimable > 0n && !r.pos.claimed).map((r) => r.m.id);
                  setBusy("claimAll");
                  (async () => {
                    try {
                      const wc = walletClient(account!);
                      const hash = await wc.writeContract({
                        address: FLATBETS,
                        abi: FLATBETS_ABI,
                        functionName: "claimMany",
                        args: [ids.map((i) => BigInt(i))],
                        chain: wc.chain,
                        account: account!,
                      } as any);
                      await publicClient.waitForTransactionReceipt({ hash });
                      setOk(`Claimed ${fmtWif(claimable)} WIF. ${explorerTx(hash)}`);
                      await load();
                      await loadUser(account!);
                    } catch (e: any) {
                      setErr(e?.shortMessage ?? e?.message ?? "Claim failed.");
                    } finally {
                      setBusy(null);
                    }
                  })();
                }} disabled={!!busy}>
                  {busy === "claimAll" ? "Claiming…" : `Claim ${fmtWif(claimable)} WIF`}
                </button>
              )}

              {err && <p className="err">{err}</p>}
              {ok && (
                <p className="ok">
                  {ok.split(" https")[0]}{" "}
                  {ok.includes("https") && <a href={ok.split(" ").pop()} target="_blank" rel="noreferrer">receipt</a>}
                </p>
              )}
              <p className="note">
                Parimutuel: all stakes on both sides form one pool, 2% of every stake is burned to
                0x…dEaD, winners split what is left in proportion to their stake.
              </p>
              <p className="rule-note">{m.rule}</p>
            </>
          )}
        </aside>
      </div>

      <footer className="foot">
        <div className="wrap" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", width: "100%", padding: 0 }}>
          <span>
            Flat Bets · WIF only · settled onchain on{" "}
            <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer">
              Robinhood Chain
            </a>
          </span>
          <span className="sig">no house, no odds, no custody</span>
        </div>
      </footer>
    </>
  );
}
