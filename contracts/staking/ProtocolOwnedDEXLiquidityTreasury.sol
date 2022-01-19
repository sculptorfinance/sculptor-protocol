// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../dependencies/openzeppelin/contracts/SafeMath.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/openzeppelin/contracts/Ownable.sol";
import "../interfaces/IChefIncentivesController.sol";

interface IPancakePair {
  function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
  function totalSupply() external view returns (uint);
  function balanceOf(address owner) external view returns (uint);
  function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IMultiFeeDistribution {
    function lockedBalances(address user) view external returns (uint256);
    function lockedSupply() external view returns (uint256);
}

contract ProtocolOwnedDEXLiquidityTreasury is Ownable {

    using SafeMath for uint256;

    IPancakePair constant public lpToken = IPancakePair(0x57190c8f9749aD5Cb342D50C74191cBBD49bf754);
    IERC20 public sBNB;
    IMultiFeeDistribution constant public treasury = IMultiFeeDistribution(0xe2b5653B669553B92CDbc7a54D3f8e40887ADc52);
    address constant public burn = 0x48f6e78B4C067bBFe9a9ed119526dad313fcDF8E;

    struct UserRecord {
        uint256 nextClaimTime;
        uint256 claimCount;
        uint256 totalBoughtBNB;
    }

    mapping (address => UserRecord) public userData;

    uint public totalSoldBNB;
    uint public minBuyAmount;
    uint public minSuperPODLLock;
    uint public buyCooldown;
    uint public superPODLCooldown;
    uint public lockedBalanceMultiplier;

    event SoldBNB(
        address indexed buyer,
        uint256 amount
    );
    event AaaaaaahAndImSuperPODLiiiiing(
        address indexed podler,
        uint256 amount
    );

    event SetsBNB(
        IERC20 _sBNB
    );

    constructor(
        uint256 _lockMultiplier,
        uint256 _minBuy,
        uint256 _minLock,
        uint256 _cooldown,
        uint256 _podlCooldown
    ) Ownable() {
        setParams(_lockMultiplier, _minBuy, _minLock, _cooldown, _podlCooldown);
    }

    function setsBNB(IERC20 _sBNB) public onlyOwner
    {
      sBNB = IERC20(_sBNB);
      emit SetsBNB(_sBNB);
    }

    function setParams(
        uint256 _lockMultiplier,
        uint256 _minBuy,
        uint256 _minLock,
        uint256 _cooldown,
        uint256 _podlCooldown
    ) public onlyOwner {
        require(_minBuy >= 1e17); // minimum buy is 0.1 lp
        lockedBalanceMultiplier = _lockMultiplier;
        minBuyAmount = _minBuy;
        minSuperPODLLock = _minLock;
        buyCooldown = _cooldown;
        superPODLCooldown = _podlCooldown;
    }

    function protocolOwnedReserves() public view returns (uint256 wbnb, uint256 sculpt) {
        (uint reserve0, uint reserve1,) = lpToken.getReserves();
        uint balance = lpToken.balanceOf(burn);
        uint totalSupply = lpToken.totalSupply();
        return (reserve0.mul(balance).div(totalSupply), reserve1.mul(balance).div(totalSupply));
    }

    function availableBNB() public view returns (uint256) {
        return sBNB.balanceOf(address(this)) / 2;
    }

    function availableForUser(address _user) public view returns (uint256) {
        UserRecord storage u = userData[_user];
        if (u.nextClaimTime > block.timestamp) return 0;
        uint available = availableBNB();
        uint userLocked = treasury.lockedBalances(_user);
        uint totalLocked = treasury.lockedSupply();
        uint amount = available.mul(lockedBalanceMultiplier).mul(userLocked).div(totalLocked);
        if (amount > available) {
            return available;
        }
        return amount;
    }

    function lpTokensPerOneBNB() public view returns (uint256) {
        uint totalSupply = lpToken.totalSupply();
        (uint reserve0,,) = lpToken.getReserves();
        return totalSupply.mul(1e18).mul(45).div(reserve0).div(100);
    }

    function _buy(uint _amount, uint _cooldownTime) internal {
        UserRecord storage u = userData[msg.sender];

        require(_amount >= minBuyAmount, "Below min buy amount");
        require(block.timestamp >= u.nextClaimTime, "Claimed too recently");

        uint lpAmount = _amount.mul(lpTokensPerOneBNB()).div(1e18);
        lpToken.transferFrom(msg.sender, burn, lpAmount);
        sBNB.transfer(msg.sender, _amount);
        sBNB.transfer(address(treasury), _amount);

        u.nextClaimTime = block.timestamp.add(_cooldownTime);
        u.claimCount = u.claimCount.add(1);
        u.totalBoughtBNB = u.totalBoughtBNB.add(_amount);
        totalSoldBNB = totalSoldBNB.add(_amount);

        emit SoldBNB(msg.sender, _amount);
    }

    function buyBNB(uint256 _amount) public {
        require(_amount <= availableForUser(msg.sender), "Amount exceeds user limit");
        _buy(_amount, buyCooldown);
    }

    function superPODL(uint256 _amount) public {
        require(treasury.lockedBalances(msg.sender) >= minSuperPODLLock, "Need to lock SCULPT!");
        _buy(_amount, superPODLCooldown);
        emit AaaaaaahAndImSuperPODLiiiiing(msg.sender, _amount);
    }
}
