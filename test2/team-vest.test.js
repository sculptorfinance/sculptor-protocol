const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Token team vesting", function () {

  const provider = waffle.provider;
  const startTimeOffset = ["0","604800","94620000"];
  const rewardsPerSecond = ["500000000000000000","209515057140000000","0"];
  const maxMintable = "20000000000000000000000000";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const DAI_PRICE = "1000000000000000000";
  const FTM_PRICE = "1500000000000000000";

  const maxMintLockedTeam = "20000000000000000000000000";

  let deployer, user1, user2, user3, user4;
  let sculptorToken;
  let mockDAI;
  let mockFTM;

  let poolConfigImp;
  let lendingImp;

  let multifeedistributor;
  let incentive;

  let lendingProvider;
  let lendingPool, poolConfig;
  let aaveOracle;
  let lendingPoolCollateral;
  let lendingRateOracle;

  let aToken, varToken, stableToken;
  let interestRateDAI, interestRateFTM;

  let wethGW;
  let teamvest;

  /**
   * This section is setup relate contract for lending protocal and stake-locked sculpt.
   */
  before(async () => {
     [deployer, user1, user2, user3, user4, user5] = await ethers.getSigners();
    //  const balance0ETH = await provider.getBalance(user1.address);
    //  const balance2ETH = await provider.getBalance(user2.address);
     // deploy Relate contract
     const SculptorToken = await ethers.getContractFactory("SculptorToken");
     sculptorToken = await SculptorToken.deploy();
     const MultiFee = await ethers.getContractFactory("MultiFeeDistribution");
     multifeedistributor = await MultiFee.deploy(sculptorToken.address);
     await sculptorToken.transfer(user1.address, "100000000000000000000000");
     await sculptorToken.transfer(user2.address, "100000000000000000000000");
     const LendingPoolProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
     lendingProvider = await LendingPoolProvider.deploy("SCULPTOR");
     const PoolConfiguratorImp = await ethers.getContractFactory("LendingPoolConfigurator");
     poolConfigImp = await PoolConfiguratorImp.deploy();
     const CollateralManager = await ethers.getContractFactory("LendingPoolCollateralManager");
     lendingPoolCollateral = await CollateralManager.deploy();
     const LendingRateOracle = await ethers.getContractFactory("LendingRateOracle");
     lendingRateOracle = await LendingRateOracle.deploy();
     // mock dai and mock ftm tokens
     const MockToken = await ethers.getContractFactory("MockERC20");
     mockDAI = await MockToken.deploy();
     await mockDAI.mint(user1.address,"500000000000000000000000");
     await mockDAI.mint(user2.address,"500000000000000000000000");
     const WETH = await ethers.getContractFactory("WETH");
     mockFTM = await WETH.deploy();

     // mock of data price feed
     const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
     const priceFeedDAI = await MockPriceFeed.deploy(
       ZERO_ADDRESS,
       ZERO_ADDRESS,
       "90000",
       "DAI",
       DAI_PRICE
     );
     const priceFeedFTM = await MockPriceFeed.deploy(
       ZERO_ADDRESS,
       ZERO_ADDRESS,
       "45000",
       "FTM",
       FTM_PRICE
     );
     // initial data price feed for oracle
     const AaveOracle = await ethers.getContractFactory("AaveOracle");
     aaveOracle = await AaveOracle.deploy(
       [mockDAI.address, mockFTM.address],
       [priceFeedDAI.address, priceFeedFTM.address]
     );
     // atoken variable stable tokens
     const AToken = await ethers.getContractFactory("AToken");
     aToken = await AToken.deploy();
     const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
     varToken = await VariableDebtToken.deploy();
     const StableDebtToken = await ethers.getContractFactory("StableDebtToken");
     stableToken = await StableDebtToken.deploy();
     // interest rate contracts
     const InterestRateStrategy = await ethers.getContractFactory("DefaultReserveInterestRateStrategy");
     interestRateDAI = await InterestRateStrategy.deploy(
       lendingProvider.address,
       "80000000000000000000000000",
       "0",
       "4000000000000000000000000",
       "100000000000000000000000000",
       "0",
       "0"
     );
     interestRateFTM = await InterestRateStrategy.deploy(
       lendingProvider.address,
       "45000000000000000000000000",
       "0",
       "7000000000000000000000000",
       "300000000000000000000000000",
       "0",
       "0"
     );

     // prepare libs of lending pool contracts
     const ReserveImp = await ethers.getContractFactory("ReserveLogic");
     const reserveImp = await ReserveImp.deploy();
     const GenericImp = await ethers.getContractFactory("GenericLogic");
     const genericImp = await GenericImp.deploy();
     const ValidateImp = await ethers.getContractFactory("ValidationLogic", {
        libraries: {
          GenericLogic: genericImp.address,
        },
     });
     const validateImp = await ValidateImp.deploy();
     const LendingImp = await ethers.getContractFactory("LendingPool", {
        libraries: {
          ValidationLogic: validateImp.address,
          ReserveLogic: reserveImp.address
        },
     });
     lendingImp = await LendingImp.deploy();

     // config lendingPool in LendingPoolAddressesProvider
     await lendingProvider.setPoolAdmin(deployer.address);
     await lendingProvider.setEmergencyAdmin(deployer.address);
     await lendingProvider.setLendingPoolImpl(lendingImp.address);
     await lendingProvider.setLendingPoolConfiguratorImpl(poolConfigImp.address);
     await lendingProvider.setPriceOracle(aaveOracle.address);
     await lendingProvider.setLendingPoolCollateralManager(lendingPoolCollateral.address);
     await lendingProvider.setLendingRateOracle(lendingRateOracle.address);

     // get transparent proxy of LendingPool and LendingPoolConfigurator contracts
     const PoolConfig = await ethers.getContractFactory("LendingPoolConfigurator");
     poolConfig = await PoolConfig.attach(await lendingProvider.getLendingPoolConfigurator());
     lendingPool = await LendingImp.attach(await lendingProvider.getLendingPool());

     // ChefIncentivesController for give sculpt as a reward to user who deposit or borrow in platform
     const Incentives = await ethers.getContractFactory("ChefIncentivesController");
     incentive = await Incentives.deploy(
         startTimeOffset,
         rewardsPerSecond,
         poolConfig.address,
         multifeedistributor.address,
         maxMintable
       );
     await incentive.start();

     const TokenVesting = await ethers.getContractFactory("TokenVesting");
     teamvest = await TokenVesting.deploy(
      multifeedistributor.address,
      "100000000000000000000",
      [user3.address, user4.address, user5.address],
      ["20000000000000000000","50000000000000000000","30000000000000000000"],
      86400*60,
      0
     );
     await teamvest.start();

     // setMinter function for give permission to incentive contract that can mint token
     await multifeedistributor.setMinters([incentive.address, teamvest.address]); //, icoLock.address
     await multifeedistributor.transferOwnership(poolConfig.address);

     const initDaiParams = [
      aToken.address,
      stableToken.address,
      varToken.address,
      await mockDAI.decimals(),
      interestRateDAI.address,
      mockDAI.address,
      multifeedistributor.address,
      incentive.address,
      100,
      "DAI",
      "Sculptor Dai Token",
      "sDAI",
      "Variable Debt Sculptor Dai Token",
      "varDAI",
      "Stable Debt Sculptor Dai Token",
      "stableDAI",
      "0x10"
    ];
    const initFtmParams = [
      aToken.address,
      stableToken.address,
      varToken.address,
      await mockFTM.decimals(),
      interestRateFTM.address,
      mockFTM.address,
      multifeedistributor.address,
      incentive.address,
      100,
      "FTM",
      "Sculptor Ftm Token",
      "sFTM",
      "Variable Debt Sculptor Ftm Token",
      "varFTM",
      "Stable Debt Sculptor Ftm Token",
      "stableFTM",
      "0x10"
    ];
    // initial pool
    await poolConfig.batchInitReserve([initDaiParams,initFtmParams]);


  });

  /**
   * This section run testing Deposit, Borrow, Repay and Withdraw.
   * Using dai as an asset in lending protocal.
   */
  it("Claim linearly", async () => {

    // config pool
    await poolConfig.enableBorrowingOnReserve(mockDAI.address, true);
    await poolConfig.setReserveFactor(mockDAI.address, 5000);
    await poolConfig.configureReserveAsCollateral(
      mockDAI.address,
      7500,
      8000,
      10500
    );
    // deploy WETHGateway contracts in case FTM is asset
    const WETHGateway = await ethers.getContractFactory("WETHGateway");
    wethGW = await WETHGateway.deploy(mockFTM.address);
    await wethGW.authorizeLendingPool(lendingPool.address);
    // config pool
    await poolConfig.enableBorrowingOnReserve(mockFTM.address, true);
    await poolConfig.setReserveFactor(mockFTM.address, 5000);
    await poolConfig.configureReserveAsCollateral(
      mockFTM.address,
      7500,
      8000,
      10500
    );

    // approve and stake to lendingPool [user1]
    await mockDAI.connect(user1).approve(lendingPool.address, "200000000000000000000000");
    // deposit 20 dai to lending
    await lendingPool.connect(user1).deposit(
      mockDAI.address,
      "200000000000000000000000",
      user1.address,
      0
    );
    // borrow 10 dai from lending
    await lendingPool.connect(user1).borrow(
      mockDAI.address,
      "150000000000000000000000",
      2,
      0,
      user1.address
    );

     // increase block timestamp
     await network.provider.send("evm_increaseTime", [86400*14]);
     await network.provider.send("evm_mine");

     const user1Repay1 = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
     console.log(280, user1Repay1);

    // approve var token for lendingPool
    await mockDAI.connect(user1).approve(lendingPool.address, "150500000000000000000000");
    // repay ~ 10 dai to lending
    await lendingPool.connect(user1).repay(
      mockDAI.address,
      "150500000000000000000000",
      2,
      user1.address
    );
    const user1Repay = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
    console.log(290, user1Repay);

    // Deposit with 200ftm
    const signer2 = provider.getSigner(user2.address);
    await wethGW.connect(signer2).depositETH(lendingPool.address, user2.address, 0, { value: ethers.utils.parseEther("500") })
    const user2Col = ((await lendingPool.getUserAccountData(user2.address)).availableBorrowsETH).toString();
    console.log(300, user2Col);
    
    // Borrow
    const varFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[9]).toString();
    const VarDebtFtm = await ethers.getContractFactory("VariableDebtToken");
    const varFTM = await VarDebtFtm.attach(varFtmAddr);
    // approveDelegation var token for WETHGateway
    await varFTM.connect(user2).approveDelegation(wethGW.address, "200000000000000000000");
    await wethGW.connect(signer2).borrowETH(lendingPool.address, "200000000000000000000", 2, 0);

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*14]);
    await network.provider.send("evm_mine");

    const user2Repay = ((await lendingPool.getUserAccountData(user2.address)).totalDebtETH).toString();
    console.log(307, user2Repay);

    // repay ~ 50 ftm to lending
    await wethGW.connect(signer2).repayETH(
      lendingPool.address,
      "205000000000000000000",
      2,
      user2.address,
      { value: ethers.utils.parseEther("205") });

    const user2Repay2 = ((await lendingPool.getUserAccountData(user2.address)).totalDebtETH).toString();
    console.log(319, user2Repay2);

    //////////////////////////////////////////////////////////////////////////////
    // stake token [locked]
    await sculptorToken.connect(user1).approve(multifeedistributor.address, "200000000000000000000");
    await multifeedistributor.connect(user1).stake("200000000000000000000", true);
    const lockedBalances = await multifeedistributor.lockedBalances(user1.address);
    expect(lockedBalances.total.toString()).to.equal("200000000000000000000");

    const sFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[7]).toString();
    const sDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[7]).toString();
    const varDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[9]).toString();
    // exit with a 50% penalty, fee to locked user
    const addrList = [sDaiAddr,varDaiAddr,sFtmAddr,varFtmAddr];
    await incentive.claim(user1.address, addrList);
    await multifeedistributor.connect(user1).exit();
    // await multifeedistributor.connect(user1).getReward();

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    // vest send to multifee
    const sct3bf = await sculptorToken.balanceOf(user3.address);
    const u3vest = await teamvest.claimable(user3.address);
    console.log(331, u3vest.toString());

    // await teamvest.connect(user3).claim(user3.address);
    // await multifeedistributor.connect(user3).exit();
    // const sct3af = await sculptorToken.balanceOf(user3.address);
    // console.log("Sculptor compare vest ====> ", sct3bf.toString(), sct3af.toString());


    // // increase block timestamp
    // await network.provider.send("evm_increaseTime", [21600]);
    // await network.provider.send("evm_mine");
    
    
    // const gFTM = await lendingPool.getReserveData(mockFTM.address);
    // const gDAI = await lendingPool.getReserveData(mockDAI.address);
    // const AToken = await ethers.getContractFactory("AToken");
    // const sFtm = await AToken.attach(gFTM.aTokenAddress);
    // const sDai = await AToken.attach(gDAI.aTokenAddress);


    // const sct3bf = await sculptorToken.balanceOf(user3.address);
    // const sftm3bf = await sFtm.balanceOf(user3.address);
    // const sdai3bf = await sDai.balanceOf(user3.address);
    // await multifeedistributor.connect(user3).withdrawExpiredLocks();
    // await multifeedistributor.connect(user3).getReward();
    // const sct3af = await sculptorToken.balanceOf(user3.address);
    // const sftm3af = await sFtm.balanceOf(user3.address);
    // const sdai3af = await sDai.balanceOf(user3.address);
    // console.log("Sculptor before-after =====> ", sct3bf.toString(), sct3af.toString());
    // console.log("Sftm before-after =====> ", sftm3bf.toString(), sftm3af.toString());
    // console.log("Sdai before-after =====> ", sdai3bf.toString(), sdai3af.toString());



    
  });

});
