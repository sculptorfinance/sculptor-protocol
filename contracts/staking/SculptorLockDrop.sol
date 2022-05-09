pragma solidity 0.7.6;
pragma abicoder v2;

import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeMath.sol";
import "../interfaces/IMultiFeeDistribution.sol";
import "../dependencies/openzeppelin/contracts/Ownable.sol";
import "../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";

contract SculptorLockDrop is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct UserInfo {
        uint256 balances;
        uint256 unlockTime;
        uint256 rewardPaid;
    }

    struct LockInfo {
        uint256 multiplier;
        uint256 duration;
        uint256 totalBalances;
    }

    address public immutable rewardToken;
    address public immutable stakedToken;

    uint256 public startTime;
    bool public lockedStatus;
    LockInfo[] public lockInfo;
    // userAddress => lockIndex => info
    mapping(address => mapping(uint256 => UserInfo)) public userInfo;

    uint256 public totalSupply;
    uint256 public totalRewardPaid;
    uint256 public maxRewardSupply;

    mapping(address => bool) private userRewardPaid;
    mapping(address => uint256) private userBalances;

    constructor(
        address _stakedToken,
        address _rewardToken,
        uint256[] memory _duration,
        uint256[] memory _multiplier
    ) {
        require(_duration.length == _multiplier.length);
        rewardToken = _rewardToken;
        stakedToken = _stakedToken;
        for (uint i; i < _duration.length; i++) {
            lockInfo.push(LockInfo({
                multiplier: _multiplier[i],
                duration: _duration[i],
                totalBalances: 0
            }));
        }
    }

    /* ========== VIEW FUNCTION ========== */

    function lockInfoLength() public view returns (uint256)  {
        uint256 length = lockInfo.length;
        return length;
    }

    /* ========== SETTING ========== */

    function start() external onlyOwner {
        require(startTime == 0);
        startTime = block.timestamp;
    }

    function end() external onlyOwner {
        lockedStatus = true;
    }

    function startRewardPaid(uint256 _amount) external onlyOwner {
        require(startTime > 0, "Not starting yet.");
        require(maxRewardSupply == 0);
        require(lockedStatus, "Start reward after end deposited.");
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
        maxRewardSupply = _amount;
    }

    function calculateRewardPaid(address _user) external view returns (uint256) {
        uint256 reward = _userRewardWeight(_user);
        return reward;
    }

    function totalSupplyWeight() external view returns (uint256) {
        uint256 total = _totalSupplyWeight();
        return total;
    }

    /* ========== MUTATIVE FUNCTION ========== */

    function deposit(uint256 _amount, uint256 _lockIndex) external nonReentrant {
        LockInfo storage lock = lockInfo[_lockIndex];
        require(_amount > 0, "Cannot be zero.");
        require(startTime > 0, "Not starting yet.");
        require(!lockedStatus, "Already ended period.");
        require(lock.duration > 0, "Invalid lock index.");
        uint256 unlockTime = block.timestamp.add(lock.duration);
        // update balance and unlockTime
        UserInfo storage user = userInfo[msg.sender][_lockIndex];
        user.balances = user.balances.add(_amount);
        if(user.unlockTime == 0) {
            user.unlockTime = unlockTime;
        }
        userBalances[msg.sender] = userBalances[msg.sender].add(_amount);
        totalSupply = totalSupply.add(_amount);
        lock.totalBalances = lock.totalBalances.add(_amount);
        IERC20(stakedToken).safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposited(msg.sender, _amount);
    }

    function getReward() external nonReentrant {
        require(!userRewardPaid[msg.sender], "User already got reward.");
        require(startTime > 0, "Not starting");
        require(lockedStatus, "Must ended lock period");

        uint256 totalRemainReward = IERC20(rewardToken).balanceOf(address(this));
        require(totalRemainReward > 0, "No reward!");
        uint256 reward = _userRewardWeight(msg.sender);
        if(reward > 0){
            userRewardPaid[msg.sender] = true;
            totalRewardPaid = totalRewardPaid.add(reward);
            IERC20(rewardToken).safeTransfer(msg.sender, reward);
        }

        emit RewardPaid(msg.sender, reward);
    }

    function withdraw() external nonReentrant {
        uint256 withdrawAmount;
        for (uint i; i < lockInfo.length; i++) {
            UserInfo storage user = userInfo[msg.sender][i];
            if(user.unlockTime <= block.timestamp) {
                withdrawAmount = withdrawAmount.add(user.balances);
                user.balances = 0;
                user.unlockTime = 0;
            }
        }
        require(userBalances[msg.sender] >= withdrawAmount, "Not enough token!");
        userBalances[msg.sender] = userBalances[msg.sender].sub(withdrawAmount);
        IERC20(stakedToken).safeTransfer(msg.sender, withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAmount);
    }

    /* ========== INTERNAL FUNCTION ========== */

    function _totalSupplyWeight() internal view returns (uint256) {
        uint256 total;
        for (uint i; i < lockInfo.length; i++) {
            LockInfo storage lock = lockInfo[i];
            uint256 weight = lock.totalBalances.mul(lock.multiplier);
            total = total.add(weight);
        }
        return total;
    }

    function _userRewardWeight(address _user) internal view returns (uint256) {
        uint256 totalPending;
        uint256 totalSupplyWeight = _totalSupplyWeight();
        for (uint i; i < lockInfo.length; i++) {
            UserInfo storage user = userInfo[_user][i];
            uint256 weightBalance = user.balances.mul(lockInfo[i].multiplier);
            uint256 pending = weightBalance.mul(maxRewardSupply).div(totalSupplyWeight);
            totalPending = totalPending.add(pending);
        }
        return totalPending;
    }


    /* ========== EVENTS ========== */

    event Deposited(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

}
