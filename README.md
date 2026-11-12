# Flat Bets

Parimutuel prediction markets settled in `$WIF` on Robinhood Chain. Binary markets, WIF-only staking, 2% of every stake burned, winners split the pool pro rata. Market creation also burns its fee in full, so using the product is deflationary on `$WIF` by construction.

Built for the `worldisflat.fun` build round (games category).

---

## What is in here

```
flatbets/
  contracts/          Solidity + Hardhat
    contracts/FlatBets.sol      parimutuel core (single contract, per-market storage)
    contracts/mocks/Mocks.sol   MockWIF + multi-round MockFeed for tests
    test/flatbets.test.ts       17 tests
    scripts/lib.ts              chain, token, Chainlink feed constants
    scripts/deploy.ts           mainnet deploy + seed
    scripts/seedfork.ts         fork deploy + seed + demo stakes
    scripts/forkdemo.ts         scripted end-to-end run (create, bet, resolve, claim)
    scripts/settle.ts           permissionless keeper: first Chainlink round at/after cutoff
    scripts/probe.ts            dry run: gas estimate and funding gap
  web/                React + Vite + viem frontend
    src/abi.ts                  generated from the compiled artifact, do not hand-edit
    src/lib.ts                  chain config, contract reads, formatting
    src/App.tsx                 market list, staking, claiming
    src/styles.css              racecard design system
```

## How it works

- **Stake**: `bet(id, side, amount)` pulls `amount` WIF, burns 2% (`BURN_BPS = 200`) to `0x…dEaD`, adds the rest to that side's pool.
- **Resolve**: equity markets settle from the Chainlink Stock Token feed. The caller passes a `roundId`; `resolveWithFeed` proves that round is the *first* one published at or after `resolveTime` by checking the previous round's `updatedAt`. Nobody can pick a favourable print.
- **Claim**: winners take the losing pool pro rata. If a market voids or one side is empty, everyone is refunded their pool share.
- **Fee**: creating a market costs 250 WIF, burned in full.

## Run it on Robinhood Chain Testnet (chain 46630)

Zero cost, real network. The testnet has a WIF token at
`0x8B00F5B2B0F96F0deBa57D7A9F16e11FABCa8ed3` (18 decimals), so the deploy uses
real WIF transfers, real approvals and real burns. What the testnet does not
have is Chainlink stock feeds, so each ticker gets a mock feed holding the same
shape of data (8-decimal price, round id, `updatedAt`). Everything else is the
same FlatBets bytecode: 2% burn on every stake, 250 WIF burned to open a market,
parimutuel maths, resolver-proof settlement.

1. Add the network to your wallet: chain id `46630`, RPC
   `https://rpc.testnet.chain.robinhood.com`, currency ETH, explorer
   `https://explorer.testnet.chain.robinhood.com`.
2. Fund the deployer at `https://faucet.testnet.chain.robinhood.com` with testnet
   ETH. WIF is optional, the script adapts to whatever the deployer holds:

   | deployer WIF | what happens |
   | --- | --- |
   | 15,000+ | 250 WIF creation fees, full-size demo stakes |
   | 2,000-15,000 | 40 WIF creation fees, stakes scaled down to fit |
   | under 2,000, or `USE_MOCK_WIF=1` | deploys `MockWIF`, mints 500,000 to the deployer, full demo |

   The WIF used is `0x8B00F5B2B0F96F0deBa57D7A9F16e11FABCa8ed3` unless you pass
   `TESTNET_WIF=<other address>`.
3. Put the key in the repo root, not in `contracts/`. The value is the
   `0x`-prefixed private key of the funded wallet (export it from MetaMask:
   account menu, account details, show private key). `$YOUR_KEY` below is just a
   shell variable name, so paste the key itself or export it first:

```
printf "FLATBETS_DEPLOYER_KEY=%s\n" "0xabc123...yourkey" > ~/flatbets/.env
```

   `.env` sits at the top of the unzipped folder, next to `README.md` and
   `LICENSE`, and is gitignored. Hardhat reads it from there, never from
   `contracts/`.

4. Deploy the stack:

```
cd ~/flatbets/contracts
TESTNET_WIF=0x8B00F5B2B0F96F0deBa57D7A9F16e11FABCa8ed3 \
  npx hardhat run scripts/testnet.ts --network robinhoodTestnet
```

It asserts chain id `46630`, deploys four mock feeds and FlatBets, creates six
markets, funds three freshly generated bettor wallets from the deployer, places
thirteen stakes, writes `contracts/deployments/testnet.json` (every tx hash in
`txs`), and prints a block you paste straight into `web/.env`:

```
VITE_CHAIN_ID=46630
VITE_RPC=https://rpc.testnet.chain.robinhood.com
VITE_EXPLORER=https://explorer.testnet.chain.robinhood.com
VITE_FLATBETS_ADDRESS=0x...
```

5. Frontend:

```
cd ~/flatbets/web && npm install && npm run dev
```

The header should read `Robinhood Chain · 46630`, six markets, real pool splits
and `WIF burned 1,707`.

6. Close the round and settle it. This pushes a new print on each mock feed,
settles the feed markets against the first print at or after their cutoff, and
resolves the two manual markets:

```
npx hardhat run scripts/settestnet.ts --network robinhoodTestnet
```

7. Claim from a winning wallet:

```
cast send $FLATBETS "claim(uint256)" 0 --private-key $WINNING_KEY \
  --rpc-url https://rpc.testnet.chain.robinhood.com
```

Verified end to end on an Anvil fork of testnet 46630 against the real WIF token:
6 markets, 13 stakes, `burned 1707.4` WIF, all six markets settled, two claims
paid 2,432 WIF on a 1,900 stake.

## Record the demo (under 3 minutes)

The board has to prove two things on camera: real WIF changing hands on chain,
and a market resolving without anyone's opinion involved.

1. `0:00` Header shot, `Robinhood Chain · 46630`, `WIF burned` ticking up. Say the
   one line: parimutuel yes/no markets where every stake burns WIF.
2. `0:20` Click a market, stake 200 WIF from the deployer wallet in the UI,
   approve, confirm. Cut to the explorer tab with the `Bet` transaction and the
   `Transfer` to `0x...dEaD` in the same receipt. This is the money shot.
3. `0:45` Show the pool bar moving and the payout preview changing as odds shift.
   Stake the other side from a second wallet to prove both sides work.
4. `1:05` Terminal: settle the round against the mock feed
   (`npx hardhat run scripts/settestnet.ts --network robinhoodTestnet`). Land on
   the line that prints the round id the contract accepted.
5. `1:25` Explorer: the `resolveWithFeed` transaction, outcome and winning side.
6. `1:40` Claim from a winning wallet, then show the WIF balance before and after
   in the wallet. The number going up is the proof.
7. `2:00` Read `burned` from `stats()` on chain
   (`cast call $FLATBETS "stats()(uint256,uint256,uint256)" --rpc-url ...`) and
   explain the flywheel in one breath: every stake burns, the burn is why holding
   WIF pays, so winners recruit the next round.
8. `2:20` Close on the repo and the contract address on the explorer.

Screen record with `Cmd+Shift+5` (macOS) at 1440p, keep the explorer tab loaded
before you start, and do one silent rehearsal so nothing stalls on loading. No
voiceover is fine, captions over each step work better for judges scrubbing.

## Requirements

- Node 20 or 22 (`nvm use 22`). Node 23 works but Hardhat prints an unsupported-version warning.
- npm
- Foundry (`anvil`) for the local fork: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- An RPC that can fork Robinhood Chain. The public one is `https://rpc.mainnet.chain.robinhood.com/`.

## Run it locally (fork of Robinhood Chain, no real money)

Terminal 1 — fork Robinhood Chain. This gives you the real `$WIF` contract, real holders and real Chainlink feeds to test against:

```bash
cd contracts
npm install
~/.foundry/bin/anvil \
  --fork-url https://rpc.mainnet.chain.robinhood.com/ \
  --port 8547 --chain-id 31337 \
  --gas-price 1000000000 --base-fee 0
```

Terminal 2 — compile, test, deploy and seed with demo stakes:

```bash
cd contracts
npx hardhat compile
npx hardhat test                                  # 17 passing
npx hardhat run scripts/seedfork.ts --network localhost
```

The last command prints a line like:

```
VITE_FLATBETS_ADDRESS=0x3A25408D952F91e42F39587820bEe5f051f4556c
markets 6 burned 1707.4 WIF
```

It deploys `FlatBets`, funds three demo bettors by impersonating a real WIF whale on the fork, and places 13 stakes so the board shows real pool splits and real burn.

Terminal 3 — the frontend:

```bash
cd web
npm install
cat > .env <<'EOF'
VITE_CHAIN_ID=31337
VITE_RPC=http://127.0.0.1:8547
VITE_EXPLORER=http://127.0.0.1:8547
VITE_FLATBETS_ADDRESS=<address printed above>
EOF
npm run dev
```

Open http://127.0.0.1:5173. You should see six markets, `WIF burned 1,707`, and `pooled 10.2k WIF`.

To bet from the UI, import an Anvil test key into your wallet and add the network manually:

- RPC `http://127.0.0.1:8547`, chain id `31337`, currency ETH
- Key for account 1 (has 6,000 fork WIF): `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

## Run the scripted end-to-end proof

`forkdemo.ts` creates markets, stakes both sides, resolves out of the Chainlink feed, claims and prints the burn totals. Nothing manual:

```bash
cd contracts
npx hardhat run scripts/forkdemo.ts --network localhost
```

## Deploy to Robinhood Chain mainnet

```bash
cd contracts
echo "FLATBETS_DEPLOYER_KEY=0x<your funded key>" > .env
npx hardhat run scripts/probe.ts --network robinhood   # prints the ETH you need for gas
npx hardhat run scripts/deploy.ts --network robinhood
```

`deploy.ts` asserts chain id `4663`, deploys, seeds the slate and writes `deployments/robinhood.json`. Then point the web build at mainnet:

```bash
cd web
VITE_CHAIN_ID=4663 \
VITE_RPC=https://rpc.mainnet.chain.robinhood.com/ \
VITE_EXPLORER=https://robinhoodchain.blockscout.com \
VITE_FLATBETS_ADDRESS=<deployed address> npm run build
```

Serve `web/dist` from any static host.

## Settling a market

```bash
cd contracts
MARKET=0 npx hardhat run scripts/settle.ts --network robinhood
DRY=1 MARKET=0 npx hardhat run scripts/settle.ts --network robinhood   # print only
```

`settle.ts` binary-searches the Chainlink round history for the first round at or after the market's cutoff and calls `resolveWithFeed`. It is permissionless: anyone can run it, and the contract rejects any round that is not the first.

## Constants

- Chain: Robinhood Chain, `4663`, RPC `https://rpc.mainnet.chain.robinhood.com/`
- `$WIF`: `0x5173b8eA6923c2d40267890D45C46a3480954773`
- Burn address: `0x000000000000000000000000000000000000dEaD`
- Stake burn: 200 bps (2%)
- Market creation fee: 250 WIF, burned in full
- Chainlink feeds and Stock Token addresses: `contracts/scripts/lib.ts`

## Known limits

- The committed `web/.env` points at the local fork address, which is only valid while that Anvil instance runs. Re-run `seedfork.ts` on a fresh fork and update the address.
- Nothing is deployed to mainnet yet: no deployer key holds ETH on Robinhood Chain. `probe.ts` reports the exact funding gap.
- `settle.ts` and `deploy.ts` are written for mainnet; the fork demo path is `seedfork.ts` + `forkdemo.ts`.
