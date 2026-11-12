// Generated from artifacts/contracts/FlatBets.sol/FlatBets.json. Do not hand-edit.
// Keeping the artifact ABI in sync avoids tuple-shape drift between contract and UI.
export const FLATBETS_ABI = [
  {
    "inputs": [],
    "name": "AlreadyClaimed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadFeedAnswer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadMarket",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadOutcome",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadTime",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BettingClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BettingOpen",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FeeTooHigh",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotFirstRound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOwner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotResolver",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NothingToClaim",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Reentrancy",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "StaleFeed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TooEarly",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAmount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "bettor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum FlatBets.Outcome",
        "name": "side",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "burned",
        "type": "uint256"
      }
    ],
    "name": "BetPlaced",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "bettor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "payout",
        "type": "uint256"
      }
    ],
    "name": "Claimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fee",
        "type": "uint256"
      }
    ],
    "name": "CreationFeeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum FlatBets.Kind",
        "name": "kind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "closeTime",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "resolveTime",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "feed",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "threshold",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "question",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "rule",
        "type": "string"
      }
    ],
    "name": "MarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum FlatBets.Outcome",
        "name": "outcome",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "observedAnswer",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "observedAt",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "MarketResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "MarketVoided",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnerSet",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "BPS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BURN_ADDRESS",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BURN_BPS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "enum FlatBets.Outcome",
        "name": "side",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "bet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "claim",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "payout",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "ids",
        "type": "uint256[]"
      }
    ],
    "name": "claimMany",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "total",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "claimed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "question",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "rule",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "closeTime",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "resolveTime",
        "type": "uint64"
      },
      {
        "internalType": "enum FlatBets.Kind",
        "name": "kind_",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "lte_",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "feed_",
        "type": "address"
      },
      {
        "internalType": "int256",
        "name": "threshold_",
        "type": "int256"
      },
      {
        "internalType": "address",
        "name": "resolver_",
        "type": "address"
      }
    ],
    "name": "createMarket",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creationFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint80",
        "name": "roundId",
        "type": "uint80"
      }
    ],
    "name": "feedRound",
    "outputs": [
      {
        "internalType": "int256",
        "name": "answer",
        "type": "int256"
      },
      {
        "internalType": "uint256",
        "name": "updatedAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getMarket",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "closeTime",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "resolveTime",
            "type": "uint64"
          },
          {
            "internalType": "enum FlatBets.Kind",
            "name": "kind",
            "type": "uint8"
          },
          {
            "internalType": "enum FlatBets.Outcome",
            "name": "outcome",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "lte",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "feed",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "feedDecimals",
            "type": "uint8"
          },
          {
            "internalType": "int256",
            "name": "threshold",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "observedAnswer",
            "type": "int256"
          },
          {
            "internalType": "uint64",
            "name": "observedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "yesPool",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "noPool",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "burned",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "bettors",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "question",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "rule",
            "type": "string"
          }
        ],
        "internalType": "struct FlatBets.Market",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "liveFeed",
    "outputs": [
      {
        "internalType": "int256",
        "name": "answer",
        "type": "int256"
      },
      {
        "internalType": "uint256",
        "name": "updatedAt",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "decimals_",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "marketCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "from",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "name": "markets",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "closeTime",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "resolveTime",
            "type": "uint64"
          },
          {
            "internalType": "enum FlatBets.Kind",
            "name": "kind",
            "type": "uint8"
          },
          {
            "internalType": "enum FlatBets.Outcome",
            "name": "outcome",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "lte",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "feed",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "feedDecimals",
            "type": "uint8"
          },
          {
            "internalType": "int256",
            "name": "threshold",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "observedAnswer",
            "type": "int256"
          },
          {
            "internalType": "uint64",
            "name": "observedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "yesPool",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "noPool",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "burned",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "bettors",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "question",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "rule",
            "type": "string"
          }
        ],
        "internalType": "struct FlatBets.Market[]",
        "name": "out",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "noStake",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "who",
        "type": "address"
      }
    ],
    "name": "payoutOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "who",
        "type": "address"
      }
    ],
    "name": "position",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "yes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "no",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isClaimed",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "enum FlatBets.Outcome",
        "name": "side",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "previewPayout",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "net",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "burned",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "payoutIfWin",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "enum FlatBets.Outcome",
        "name": "outcome",
        "type": "uint8"
      }
    ],
    "name": "resolveManual",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint80",
        "name": "roundId",
        "type": "uint80"
      }
    ],
    "name": "resolveWithFeed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "fee",
        "type": "uint256"
      }
    ],
    "name": "setCreationFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stats",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "markets_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "staked_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "burned_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "claimed_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "wifHeld_",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalBurned",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalClaimed",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalStaked",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "next",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "voidMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wif",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "yesStake",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const WIF_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
