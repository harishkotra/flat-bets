// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test-only ERC20 that mimics $WIF (18 decimals, plain transfers).
contract MockWIF {
    string public name = "dogwifhat";
    string public symbol = "WIF";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        return _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) private returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @dev Chainlink-shaped feed for unit tests: keeps every round so the
///      first-round-after-cutoff proof can be exercised for real.
contract MockFeed {
    struct Round {
        int256 answer;
        uint256 updatedAt;
        bool exists;
    }

    uint8 public decimals;
    uint80 public roundId;
    mapping(uint80 => Round) private rounds;
    mapping(uint80 => uint256) private price;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        roundId = 1;
        rounds[1] = Round({answer: answer_, updatedAt: block.timestamp, exists: true});
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        roundId += 1;
        rounds[roundId] = Round({answer: answer_, updatedAt: updatedAt_, exists: true});
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round memory r = rounds[roundId];
        return (roundId, r.answer, r.updatedAt, r.updatedAt, roundId);
    }

    function getRoundData(uint80 id)
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round memory r = rounds[id];
        require(r.exists, "no round");
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}
