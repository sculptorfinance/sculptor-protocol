// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {ILendingPoolAddressesProvider} from '../interfaces/ILendingPoolAddressesProvider.sol';
import {IChefIncentivesController} from '../interfaces/IChefIncentivesController.sol';
import {IUiIncentiveDataProviderV2} from './interfaces/IUiIncentiveDataProviderV2.sol';
import {ChefIncentivesController} from '../staking/ChefIncentivesController.sol';
import {IOnwardIncentivesController} from '../interfaces/IOnwardIncentivesController.sol';
import {ILendingPool} from '../interfaces/ILendingPool.sol';
import {IAToken2} from '../interfaces/IAToken2.sol';
import {IVariableDebtToken2} from '../interfaces/IVariableDebtToken2.sol';
import {IStableDebtToken} from '../interfaces/IStableDebtToken.sol';
import {UserConfiguration} from '../protocol/libraries/configuration/UserConfiguration.sol';
import {DataTypes} from '../protocol/libraries/types/DataTypes.sol';
import {IERC20Detailed} from '../dependencies/openzeppelin/contracts/IERC20Detailed.sol';

contract UiIncentiveDataProviderV3 is IUiIncentiveDataProviderV2 {
  using UserConfiguration for DataTypes.UserConfigurationMap;

  ChefIncentivesController chefIncentive;
  address sculptToken;
  constructor(address _sculptToken, address _chefIncentive) {
    sculptToken = _sculptToken;
    chefIncentive = ChefIncentivesController(_chefIncentive);
  }

  function getFullReservesIncentiveData(ILendingPoolAddressesProvider provider, address user)
    external
    view
    override
    returns (AggregatedReserveIncentiveData[] memory, UserReserveIncentiveData[] memory)
  {
    return (_getReservesIncentivesData(provider), _getUserReservesIncentivesData(provider, user));
  }

  function getReservesIncentivesData(ILendingPoolAddressesProvider provider)
    external
    view
    override
    returns (AggregatedReserveIncentiveData[] memory)
  {
    return _getReservesIncentivesData(provider);
  }

  function _getReservesIncentivesData(ILendingPoolAddressesProvider provider)
    private
    view
    returns (AggregatedReserveIncentiveData[] memory)
  {
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    address[] memory reserves = lendingPool.getReservesList();
    AggregatedReserveIncentiveData[] memory reservesIncentiveData =
      new AggregatedReserveIncentiveData[](reserves.length);

    for (uint256 i = 0; i < reserves.length; i++) {
      AggregatedReserveIncentiveData memory reserveIncentiveData = reservesIncentiveData[i];
      reserveIncentiveData.underlyingAsset = reserves[i];

      DataTypes.ReserveData memory baseData = lendingPool.getReserveData(reserves[i]);

      // ATOKEN
      if (address(chefIncentive) != address(0)) {
        uint256 index;
        uint256 poolLength = chefIncentive.poolLength();

        for (uint256 i = 0; i < poolLength; i++) {
          if(chefIncentive.registeredTokens(i) == baseData.aTokenAddress){
            index = i;
            break;
          }
        }

        (,,uint256 lasttime,,) = chefIncentive.poolInfo(baseData.aTokenAddress);
        reserveIncentiveData.aIncentiveData = IncentiveData(
          chefIncentive.rewardsPerSecond(),
          lasttime,
          index,
          chefIncentive.startTime() + 94600000,
          baseData.aTokenAddress,
          sculptToken,
          address(chefIncentive),
          IERC20Detailed(sculptToken).decimals(),
          18
        );
      }

      // VaiableDebtToken
      if (address(chefIncentive) != address(0)) {

        uint256 index;
        uint256 poolLength = chefIncentive.poolLength();
        for (uint256 i = 0; i < poolLength; i++) {
          if(chefIncentive.registeredTokens(i) == baseData.variableDebtTokenAddress){
            index = i;
            break;
          }
        }

        (,,uint256 lasttime,,) = chefIncentive.poolInfo(baseData.variableDebtTokenAddress);

        reserveIncentiveData.vIncentiveData = IncentiveData(
          chefIncentive.rewardsPerSecond(),
          lasttime,
          index,
          chefIncentive.startTime() + 94600000,
          baseData.variableDebtTokenAddress,
          sculptToken,
          address(chefIncentive),
          IERC20Detailed(sculptToken).decimals(),
          18
        );
      }

    }
    return (reservesIncentiveData);
  }

  function getUserReservesIncentivesData(ILendingPoolAddressesProvider provider, address user)
    external
    view
    override
    returns (UserReserveIncentiveData[] memory)
  {
    return _getUserReservesIncentivesData(provider, user);
  }

  function _getUserReservesIncentivesData(ILendingPoolAddressesProvider provider, address user)
    private
    view
    returns (UserReserveIncentiveData[] memory)
  {

    address rewardToken = sculptToken;
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    address[] memory reserves = lendingPool.getReservesList();

    UserReserveIncentiveData[] memory userReservesIncentivesData =
      new UserReserveIncentiveData[](user != address(0) ? reserves.length : 0);

    for (uint256 i = 0; i < reserves.length; i++) {
      DataTypes.ReserveData memory baseData = lendingPool.getReserveData(reserves[i]);

      // user reserve data
      userReservesIncentivesData[i].underlyingAsset = reserves[i];

      IUiIncentiveDataProviderV2.UserIncentiveData memory aUserIncentiveData;


      if (address(chefIncentive) != address(0)) {

        uint256 index;
        uint256 poolLength = chefIncentive.poolLength();
        for (uint256 i = 0; i < poolLength; i++) {
          if(chefIncentive.registeredTokens(i) == baseData.aTokenAddress){
            index = i;
            break;
          }
        }

        address userAddr = user;
        address[] memory data = new address[](1);
        data[0] = address(baseData.aTokenAddress);
        uint256[] memory x;
        x = chefIncentive.claimableReward(userAddr,data);

        aUserIncentiveData.tokenincentivesUserIndex = index;
        aUserIncentiveData.userUnclaimedRewards = x[0];
        aUserIncentiveData.tokenAddress = baseData.aTokenAddress;
        aUserIncentiveData.rewardTokenAddress = sculptToken;
        aUserIncentiveData.incentiveControllerAddress = address(chefIncentive);
        aUserIncentiveData.rewardTokenDecimals = IERC20Detailed(sculptToken).decimals();
      }


      userReservesIncentivesData[i].aTokenIncentivesUserData = aUserIncentiveData;

      UserIncentiveData memory vUserIncentiveData;


      if (address(chefIncentive) != address(0)) {

        uint256 index;
        uint256 poolLength = chefIncentive.poolLength();
        for (uint256 i = 0; i < poolLength; i++) {
          if(chefIncentive.registeredTokens(i) == baseData.variableDebtTokenAddress){
            index = i;
            break;
          }
        }
        address userAddr = user;
        address[] memory data = new address[](1);
        data[0] = address(baseData.variableDebtTokenAddress);
        uint256[] memory x;
        x = chefIncentive.claimableReward(userAddr,data);

        vUserIncentiveData.tokenincentivesUserIndex = index;
        vUserIncentiveData.userUnclaimedRewards = x[0];
        vUserIncentiveData.tokenAddress = baseData.variableDebtTokenAddress;
        vUserIncentiveData.rewardTokenAddress = sculptToken;
        vUserIncentiveData.incentiveControllerAddress = address(chefIncentive);
        vUserIncentiveData.rewardTokenDecimals = IERC20Detailed(sculptToken).decimals();

      }


      userReservesIncentivesData[i].vTokenIncentivesUserData = vUserIncentiveData;
    }

    return (userReservesIncentivesData);
  }
}
