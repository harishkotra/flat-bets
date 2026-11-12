// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IPriceFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 id, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/// @title Flat Bets
/// @notice Parimutuel betting markets settled in $WIF on Robinhood Chain.
///         Every stake burns 2% of itself in $WIF before it enters the pool, so
///         using the product permanently removes supply from the token.
///         Equity markets settle from the Chainlink feed that prices Robinhood
///         Stock Tokens; open markets settle from a published rule and a named
///         resolver, with a documented void path.
contract FlatBets {
    uint256 public constant BPS = 10_000;
    uint256 public constant BURN_BPS = 200; // 2% of every stake, burned on the spot
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    enum Kind {
        Manual,
        Feed
    }

    /// @dev Open is 0 so `outcome == Open` reads as "not resolved".
    enum Outcome {
        Open,
        Yes,
        No,
        Void
    }

    struct Market {
        address creator;
        address resolver;
        uint64 closeTime;
        uint64 resolveTime;
        Kind kind;
        Outcome outcome;
        bool lte; // false: YES wins if answer >= threshold; true: answer <= threshold
        address feed;
        uint8 feedDecimals;
        int256 threshold;
        int256 observedAnswer;
        uint64 observedAt;
        uint256 yesPool;
        uint256 noPool;
        uint256 burned;
        uint256 bettors;
        string question;
        string rule;
    }

    IERC20 public immutable wif;
    address public owner;
    uint256 public creationFee;
    uint256 public marketCount;

    uint256 public totalStaked;
    uint256 public totalBurned;
    uint256 public totalClaimed;

    mapping(uint256 => Market) private _markets;
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;

    uint256 private _lock = 1;

    error NotOwner();
    error NotResolver();
    error BadMarket();
    error BettingClosed();
    error BettingOpen();
    error TooEarly();
    error AlreadyResolved();
    error NotResolved();
    error NothingToClaim();
    error AlreadyClaimed();
    error ZeroAmount();
    error TransferFailed();
    error StaleFeed();
    error BadFeedAnswer();
    error NotFirstRound();
    error BadOutcome();
    error BadTime();
    error FeeTooHigh();
    error Reentrancy();

    event MarketCreated(
        uint256 indexed id,
        address indexed creator,
        address resolver,
        Kind kind,
        uint64 closeTime,
        uint64 resolveTime,
        address feed,
        int256 threshold,
        string question,
        string rule
    );
    event BetPlaced(uint256 indexed id, address indexed bettor, Outcome side, uint256 amount, uint256 burned);
    event MarketResolved(
        uint256 indexed id, Outcome outcome, int256 observedAnswer, uint64 observedAt, address by
    );
    event MarketVoided(uint256 indexed id, address by);
    event Claimed(uint256 indexed id, address indexed bettor, uint256 payout);
    event CreationFeeSet(uint256 fee);
    event OwnerSet(address owner);

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address wif_, uint256 creationFee_) {
        if (wif_ == address(0)) revert BadMarket();
        wif = IERC20(wif_);
        owner = msg.sender;
        creationFee = creationFee_;
        emit OwnerSet(msg.sender);
        emit CreationFeeSet(creationFee_);
    }

    // ---------------------------------------------------------------- admin

    function setCreationFee(uint256 fee) external onlyOwner {
        if (fee > 100_000 ether) revert FeeTooHigh();
        creationFee = fee;
        emit CreationFeeSet(fee);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert BadMarket();
        owner = next;
        emit OwnerSet(next);
    }

    // ----------------------------------------------------------- create

    /// @notice Open a new market. The creation fee is paid in $WIF and burned.
    /// @param kind_ 0 = manual resolution, 1 = Chainlink feed resolution.
    /// @param feed_ aggregator proxy, only for kind 1.
    /// @param threshold_ feed answer (in feed decimals) at or above which YES wins.
    function createMarket(
        string calldata question,
        string calldata rule,
        uint64 closeTime,
        uint64 resolveTime,
        Kind kind_,
        bool lte_,
        address feed_,
        int256 threshold_,
        address resolver_
    ) external nonReentrant returns (uint256 id) {
        if (closeTime <= block.timestamp) revert BadTime();
        if (resolveTime < closeTime) revert BadTime();
        if (bytes(question).length == 0 || bytes(question).length > 280) revert BadMarket();
        if (bytes(rule).length == 0 || bytes(rule).length > 600) revert BadMarket();
        if (resolver_ == address(0)) revert BadMarket();

        uint8 fdec;
        if (kind_ == Kind.Feed) {
            if (feed_ == address(0) || threshold_ == 0) revert BadMarket();
            fdec = IPriceFeed(feed_).decimals();
        } else if (feed_ != address(0) || threshold_ != 0 || lte_) {
            revert BadMarket();
        }

        _burnAll(msg.sender, creationFee);

        id = marketCount++;
        Market storage m = _markets[id];
        m.creator = msg.sender;
        m.resolver = resolver_;
        m.closeTime = closeTime;
        m.resolveTime = resolveTime;
        m.kind = kind_;
        m.outcome = Outcome.Open;
        m.lte = lte_;
        m.feed = feed_;
        m.feedDecimals = fdec;
        m.threshold = threshold_;
        m.question = question;
        m.rule = rule;

        emit MarketCreated(
            id, msg.sender, resolver_, kind_, closeTime, resolveTime, feed_, threshold_, question, rule
        );
    }

    // -------------------------------------------------------------- bet

    /// @notice Stake $WIF on YES (1) or NO (2). 2% of the amount is burned.
    function bet(uint256 id, Outcome side, uint256 amount) external nonReentrant {
        Market storage m = _markets[id];
        if (m.closeTime == 0) revert BadMarket();
        if (m.outcome != Outcome.Open) revert AlreadyResolved();
        if (block.timestamp >= m.closeTime) revert BettingClosed();
        if (amount == 0) revert ZeroAmount();
        if (side != Outcome.Yes && side != Outcome.No) revert BadOutcome();

        uint256 burned = _pullAndBurn(msg.sender, amount);
        uint256 net = amount - burned;

        if (side == Outcome.Yes) {
            m.yesPool += net;
            yesStake[id][msg.sender] += net;
        } else {
            m.noPool += net;
            noStake[id][msg.sender] += net;
        }
        if (yesStake[id][msg.sender] + noStake[id][msg.sender] == net) {
            m.bettors += 1;
        }
        m.burned += burned;
        totalStaked += net;

        emit BetPlaced(id, msg.sender, side, net, burned);
    }

    // ---------------------------------------------------------- resolve

    /// @notice Manual resolution by the market's named resolver.
    function resolveManual(uint256 id, Outcome outcome) external {
        Market storage m = _markets[id];
        if (m.closeTime == 0) revert BadMarket();
        if (msg.sender != m.resolver && msg.sender != owner) revert NotResolver();
        if (block.timestamp < m.resolveTime) revert TooEarly();
        if (m.outcome != Outcome.Open) revert AlreadyResolved();
        if (outcome != Outcome.Yes && outcome != Outcome.No && outcome != Outcome.Void) revert BadOutcome();

        m.outcome = outcome;
        emit MarketResolved(id, outcome, 0, 0, msg.sender);
        if (outcome == Outcome.Void) emit MarketVoided(id, msg.sender);
    }

    /// @notice Feed resolution, pinned to one specific Chainlink round.
    ///         The caller supplies the round id; the contract proves that it is
    ///         the FIRST round published at or after the market's resolve time.
    ///         Nobody can pick a friendlier price: the round is a fact of the
    ///         feed, not a choice.
    function resolveWithFeed(uint256 id, uint80 roundId) external {
        Market storage m = _markets[id];
        if (m.closeTime == 0) revert BadMarket();
        if (m.kind != Kind.Feed) revert BadMarket();
        if (block.timestamp < m.resolveTime) revert TooEarly();
        if (m.outcome != Outcome.Open) revert AlreadyResolved();

        (uint80 gotId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = IPriceFeed(m.feed).getRoundData(roundId);
        if (gotId != roundId) revert BadFeedAnswer();
        if (answer <= 0) revert BadFeedAnswer();
        if (answeredInRound < roundId) revert StaleFeed();
        if (updatedAt < m.resolveTime) revert TooEarly();
        if (roundId > 1) {
            (, , , uint256 prevUpdatedAt, ) = IPriceFeed(m.feed).getRoundData(roundId - 1);
            if (prevUpdatedAt >= m.resolveTime) revert NotFirstRound();
        }

        m.observedAnswer = answer;
        m.observedAt = uint64(updatedAt);
        m.outcome = m.lte ? (answer <= m.threshold ? Outcome.Yes : Outcome.No) : (answer >= m.threshold ? Outcome.Yes : Outcome.No);
        emit MarketResolved(id, m.outcome, answer, uint64(updatedAt), msg.sender);
    }

    /// @notice Resolver or owner can void an open market any time after it closed,
    ///         for ambiguity, a broken feed or a corporate action freeze.
    function voidMarket(uint256 id) external {
        Market storage m = _markets[id];
        if (m.closeTime == 0) revert BadMarket();
        if (msg.sender != m.resolver && msg.sender != owner) revert NotResolver();
        if (block.timestamp < m.closeTime) revert BettingOpen();
        if (m.outcome != Outcome.Open) revert AlreadyResolved();
        m.outcome = Outcome.Void;
        emit MarketResolved(id, Outcome.Void, 0, 0, msg.sender);
        emit MarketVoided(id, msg.sender);
    }

    // ------------------------------------------------------------- claim

    function claim(uint256 id) public nonReentrant returns (uint256 payout) {
        Market storage m = _markets[id];
        if (m.closeTime == 0) revert BadMarket();
        if (m.outcome == Outcome.Open) revert NotResolved();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();

        uint256 yes = yesStake[id][msg.sender];
        uint256 no = noStake[id][msg.sender];
        if (yes == 0 && no == 0) revert NothingToClaim();

        if (m.outcome == Outcome.Void || m.yesPool == 0 || m.noPool == 0) {
            payout = yes + no;
        } else if (m.outcome == Outcome.Yes) {
            payout = (yes * (m.yesPool + m.noPool)) / m.yesPool;
        } else {
            payout = (no * (m.yesPool + m.noPool)) / m.noPool;
        }

        claimed[id][msg.sender] = true;
        yesStake[id][msg.sender] = 0;
        noStake[id][msg.sender] = 0;
        totalClaimed += payout;

        if (payout > 0) {
            if (!wif.transfer(msg.sender, payout)) revert TransferFailed();
        }
        emit Claimed(id, msg.sender, payout);
    }

    function claimMany(uint256[] calldata ids) external returns (uint256 total) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (!claimed[ids[i]][msg.sender] && (yesStake[ids[i]][msg.sender] > 0 || noStake[ids[i]][msg.sender] > 0)) {
                total += claim(ids[i]);
            }
        }
    }

    // -------------------------------------------------------------- views

    function getMarket(uint256 id) external view returns (Market memory) {
        return _markets[id];
    }

    function markets(uint256 from, uint256 count) external view returns (Market[] memory out) {
        uint256 end = from + count;
        if (end > marketCount) end = marketCount;
        out = new Market[](end - from);
        for (uint256 i = from; i < end; i++) {
            out[i - from] = _markets[i];
        }
    }

    function position(uint256 id, address who) external view returns (uint256 yes, uint256 no, bool isClaimed) {
        return (yesStake[id][who], noStake[id][who], claimed[id][who]);
    }

    /// @notice What `who` would receive right now if they claimed.
    function payoutOf(uint256 id, address who) public view returns (uint256) {
        Market storage m = _markets[id];
        if (m.outcome == Outcome.Open || claimed[id][who]) return 0;
        uint256 yes = yesStake[id][who];
        uint256 no = noStake[id][who];
        if (yes == 0 && no == 0) return 0;
        if (m.outcome == Outcome.Void || m.yesPool == 0 || m.noPool == 0) return yes + no;
        if (m.outcome == Outcome.Yes) return (yes * (m.yesPool + m.noPool)) / m.yesPool;
        return (no * (m.yesPool + m.noPool)) / m.noPool;
    }

    /// @notice Live feed answer for a feed market, for the settlement panel.
    function liveFeed(uint256 id) external view returns (int256 answer, uint256 updatedAt, uint8 decimals_) {
        Market storage m = _markets[id];
        if (m.kind != Kind.Feed || m.feed == address(0)) return (0, 0, 0);
        (uint80 roundId, int256 a,, uint256 u, uint80 air) = IPriceFeed(m.feed).latestRoundData();
        if (air < roundId) return (0, 0, m.feedDecimals);
        return (a, u, m.feedDecimals);
    }

    /// @notice Read one Chainlink round for a market, used by the settlement bot
    ///         to find the first round at or after the cutoff.
    function feedRound(uint256 id, uint80 roundId)
        external
        view
        returns (int256 answer, uint256 updatedAt, bool exists)
    {
        Market storage m = _markets[id];
        if (m.kind != Kind.Feed || m.feed == address(0)) return (0, 0, false);
        try IPriceFeed(m.feed).getRoundData(roundId) returns (uint80, int256 a, uint256, uint256 u, uint80) {
            return (a, u, true);
        } catch {
            return (0, 0, false);
        }
    }

    function previewPayout(uint256 id, Outcome side, uint256 amount)
        external
        view
        returns (uint256 net, uint256 burned, uint256 payoutIfWin)
    {
        Market storage m = _markets[id];
        burned = (amount * BURN_BPS) / BPS;
        net = amount - burned;
        uint256 pool = side == Outcome.Yes ? m.yesPool : m.noPool;
        uint256 total = m.yesPool + m.noPool + net;
        payoutIfWin = pool + net == 0 ? 0 : (net * total) / (pool + net);
    }

    function stats() external view returns (uint256 markets_, uint256 staked_, uint256 burned_, uint256 claimed_, uint256 wifHeld_) {
        return (marketCount, totalStaked, totalBurned, totalClaimed, wif.balanceOf(address(this)));
    }

    // ------------------------------------------------------------- internal

    /// @dev The market creation fee is burned in full: opening a market is a
    /// deflationary act on $WIF, not revenue for the operator.
    function _burnAll(address from, uint256 amount) private {
        if (amount == 0) return;
        if (!wif.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (!wif.transfer(BURN_ADDRESS, amount)) revert TransferFailed();
        totalBurned += amount;
    }

    function _pullAndBurn(address from, uint256 amount) private returns (uint256 burned) {
        if (amount == 0) return 0;
        burned = (amount * BURN_BPS) / BPS;
        if (!wif.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (burned > 0) {
            if (!wif.transfer(BURN_ADDRESS, burned)) revert TransferFailed();
            totalBurned += burned;
        }
    }
}
