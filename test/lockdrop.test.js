const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Lockdrop", function () {

  const provider = waffle.provider;
  const startTimeOffset = ["0","604800","94620000"];
  const rewardsPerSecond = ["500000000000000000","209515057140000000","0"];
  const maxMintable = "20000000000000000000000000";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const DAI_PRICE = "1000000000000000000";

  const duration = [86400,86400*7,86400*14];
  const multiplier = ["1","3","6"];
  const stakeMint = "5000000000000000000000"; // 5000
  const maxApprove = "1000000000000000000000000";

  let deployer, user1, user2, user3, user4;
  let sculptorToken;
  let mockDAI;

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

  /**
   * This section is setup relate contract for lending protocal and stake-locked sculpt.
   */
  before(async () => {
     [deployer, user1, user2, user3, user4] = await ethers.getSigners();
     // deploy Relate contract
     const SculptorToken = await ethers.getContractFactory("SculptorToken");
     sculptorToken = await SculptorToken.deploy();
     const MultiFee = await ethers.getContractFactory("MultiFeeDistribution");
     multifeedistributor = await MultiFee.deploy(sculptorToken.address);
    //  await sculptorToken.transfer(user1.address, "1000000000000000000000");
    //  await sculptorToken.transfer(user2.address, "1000000000000000000000");
     const LendingPoolProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
     lendingProvider = await LendingPoolProvider.deploy("SCULPTOR");
     const PoolConfiguratorImp = await ethers.getContractFactory("LendingPoolConfigurator");
     poolConfigImp = await PoolConfiguratorImp.deploy();
     const CollateralManager = await ethers.getContractFactory("LendingPoolCollateralManager");
     lendingPoolCollateral = await CollateralManager.deploy();
     const LendingRateOracle = await ethers.getContractFactory("LendingRateOracle");
     lendingRateOracle = await LendingRateOracle.deploy();
     // mock dai
     const MockToken = await ethers.getContractFactory("MockERC20");
     mockDAI = await MockToken.deploy();
     await mockDAI.mint(user1.address, stakeMint);
     await mockDAI.mint(user2.address, stakeMint);
     await mockDAI.mint(user3.address, stakeMint);
     await mockDAI.mint(user4.address, stakeMint);

     // mock of data price feed
     const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
     const priceFeedDAI = await MockPriceFeed.deploy(
       ZERO_ADDRESS,
       ZERO_ADDRESS,
       "90000",
       "DAI",
       DAI_PRICE
     );

     // initial data price feed for oracle
     const AaveOracle = await ethers.getContractFactory("AaveOracle");
     aaveOracle = await AaveOracle.deploy(
       [mockDAI.address],
       [priceFeedDAI.address]
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
    //  await incentive.start();
    // setMinter function for give permission to incentive contract that can mint token
    await multifeedistributor.setMinters([incentive.address]);
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
    // initial pool
    await poolConfig.batchInitReserve([initDaiParams]);
    const listPool = await lendingPool.getReservesList();
    // config pool
    await poolConfig.enableBorrowingOnReserve(mockDAI.address, true);
    await poolConfig.setReserveFactor(mockDAI.address, 5000);
    await poolConfig.configureReserveAsCollateral(
      mockDAI.address,
      8000,
      8500,
      10500
    );
    const sDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[7]).toString();
    // deploy and start lockdrop contracts
    const LockDrop = await ethers.getContractFactory("SculptorLockDrop");
    lockDrop = await LockDrop.deploy(sDaiAddr, sculptorToken.address, lendingPool.address, duration, multiplier);
    // start deposit
    await lockDrop.start();

  });

  /**
   * This section run testing Lockdrop.
   * Testing locking aToken to Lockdrop contacts.
   * Testing emission that recieve from Lockdrop .
   */
  it("Lockdrop deposit, withdraw", async () => {
    // approve and stake to lendingPool
    await mockDAI.connect(user1).approve(lendingPool.address, maxApprove);
    await mockDAI.connect(user2).approve(lendingPool.address, maxApprove);
    await mockDAI.connect(user3).approve(lendingPool.address, maxApprove);
    await mockDAI.connect(user4).approve(lendingPool.address, maxApprove);
    // deposit 100 dai to lending
    await lendingPool.connect(user1).deposit(
      mockDAI.address,
      "100000000000000000000",
      user1.address,
      0
    );
    // deposit 100 dai to lending
    await lendingPool.connect(user2).deposit(
      mockDAI.address,
      "200000000000000000000",
      user2.address,
      0
    );
    // borrow 20 dai from lending
    await lendingPool.connect(user1).borrow(
      mockDAI.address,
      "20000000000000000000",
      2,
      0,
      user1.address
    );

    // borrow 30 dai from lending
    await lendingPool.connect(user2).borrow(
      mockDAI.address,
      "30000000000000000000",
      2,
      0,
      user2.address
    );

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    // repay ~ 20 dai to lending
    await lendingPool.connect(user1).repay(
      mockDAI.address,
      "20010000000000000000",
      2,
      user1.address
    );

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    // deposit 100 dai to lending
    await lendingPool.connect(user3).deposit(
      mockDAI.address,
      "400000000000000000000",
      user3.address,
      0
    );

    // deposit 100 dai to lending
    await lendingPool.connect(user4).deposit(
      mockDAI.address,
      "2000000000000000000000",
      user4.address,
      0
    );

    

    // sDAI
    const sDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[7]).toString();
    const AToken = await ethers.getContractFactory("AToken");
    const sDai = await AToken.attach(sDaiAddr); 
    // checking collateral balance is 100$
    // const user1Info = ((await lendingPool.getUserAccountData(user2.address)).totalCollateralETH).toString();
    // const user1Debt = ((await lendingPool.getUserAccountData(user2.address)).totalDebtETH).toString();
    // const user1Avl = ((await lendingPool.getUserAccountData(user2.address)).availableBorrowsETH).toString();
    // console.log(264, user1Info, user1Debt, user1Avl);
    
    // lockdrop
    
    const userAvl1Deposit = (await lockDrop.availableLockToken(user1.address)).toString();
    const userAvl2Deposit = (await lockDrop.availableLockToken(user2.address)).toString();
    await sDai.connect(user1).approve(lockDrop.address, maxApprove);
    await sDai.connect(user2).approve(lockDrop.address, maxApprove);
    await sDai.connect(user3).approve(lockDrop.address, maxApprove);
    await sDai.connect(user4).approve(lockDrop.address, maxApprove);
    // const allowance = (await sDai.allowance(user2.address, lockDrop.address)).toString();
    // console.log(221, userAvl1Deposit);
    await lockDrop.connect(user1).deposit(userAvl1Deposit, 0);
    await lockDrop.connect(user2).deposit(userAvl2Deposit, 0);
    await lockDrop.connect(user3).deposit("200000000000000000000", 0);
    await lockDrop.connect(user4).deposit("200000000000000000000", 0);
    const totalBf = (await lockDrop.totalSupply()).toString();
    const user1Info = (await lockDrop.userInfo(user1.address, 0));
    const user4Info = (await lockDrop.userInfo(user4.address, 0));
    const user3Info = (await lockDrop.userInfo(user3.address, 0));

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*2]);
    await network.provider.send("evm_mine");

    // console.log(277, user1Info);
    // console.log(282, user2Info);
    // console.log(286, user3Info);
    const shares1 = user1Info.shares.toString();
    const user1Bl = (await lockDrop.sharesToBalances(shares1)).toString();
    
    await lockDrop.end();
    await sculptorToken.approve(lockDrop.address, maxApprove);
    await lockDrop.startRewardPaid("5000000000000000000000");

    const reward = (await lockDrop.maxRewardSupply()).toString();
    console.log(314, reward);
    
    await lockDrop.connect(user1).getReward();
    await lockDrop.connect(user2).getReward();
    await lockDrop.connect(user3).getReward();
    await lockDrop.connect(user4).getReward();
    const reward3 = (await sculptorToken.balanceOf(user3.address)).toString();
    const reward4 = (await sculptorToken.balanceOf(user4.address)).toString();
    const paid = (await lockDrop.totalRewardPaid()).toString();

    // console.log(317, reward3, reward4, paid);
    // check withdraw
    // const bl11 = (await sDai.balanceOf(user1.address)).toString();
    // await lockDrop.connect(user1).withdraw(0);
    // const bl12 = (await sDai.balanceOf(user1.address)).toString();
    // const diff1 = BigNumber(bl12).minus(BigNumber(bl11)).toString();
    // await lockDrop.connect(user2).withdraw(0);
    // await lockDrop.connect(user3).withdraw(0);

    // const shares4 = user4Info.shares.toString();
    // const user4Bl = (await lockDrop.sharesToBalances(shares4)).toString();
    // const bl41 = (await sDai.balanceOf(user4.address)).toString();
    // const totalSharebf = (await lockDrop.sharesTotal()).toString();
    // console.log("total supply => ", (await lockDrop.totalSupply()).toString());
    // await lockDrop.connect(user4).withdraw(0);
    // const bl42 = (await sDai.balanceOf(user4.address)).toString();
    // const diff4 = BigNumber(bl42).minus(BigNumber(bl41)).toString();
    // console.log(310, totalSharebf);
    // // console.log(302, bl11, bl12, user1Bl, diff1);
    // console.log(312, bl41, bl42, user4Bl, diff4);
    // const totalAt = (await lockDrop.totalSupply()).toString();
    // const totalShare = (await lockDrop.sharesTotal()).toString();
    // console.log(289, totalBf, totalAt, totalShare);
  });


});
