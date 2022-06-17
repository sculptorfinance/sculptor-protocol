const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Lending Pool and Stake Locked Sculpt Token", function () {

  const provider = waffle.provider;
  const startTimeOffset = ["0","604800","94620000"];
  const rewardsPerSecond = ["500000000000000000","209515057140000000","0"];
  const maxMintable = "20000000000000000000000000";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const DAI_PRICE = "1000000000000000000";
  const FTM_PRICE = "1500000000000000000";

  let deployer, user1, user2;
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

  /**
   * This section is setup relate contract for lending protocal and stake-locked sculpt.
   */
  before(async () => {
     [deployer, user1, user2] = await ethers.getSigners();
     const balance0ETH = await provider.getBalance(user1.address);
     const balance2ETH = await provider.getBalance(user2.address);
     // deploy Relate contract
     const SculptorToken = await ethers.getContractFactory("SculptorToken");
     sculptorToken = await SculptorToken.deploy();
     const MultiFee = await ethers.getContractFactory("MultiFeeDistribution");
     multifeedistributor = await MultiFee.deploy(sculptorToken.address);
     await sculptorToken.transfer(user1.address, "1000000000000000000000");
     await sculptorToken.transfer(user2.address, "1000000000000000000000");
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
     await mockDAI.mint(user1.address,"500000000000000000000");
     await mockDAI.mint(user2.address,"500000000000000000000");
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
     // setMinter function for give permission to incentive contract that can mint token
     await multifeedistributor.setMinters([incentive.address]);
     await multifeedistributor.transferOwnership(poolConfig.address);

  });

  /**
   * This section run testing oracle and fee price.
   */
  it("Get asset price from oracle correcly", async () => {
    const priceDAI = (await aaveOracle.getAssetPrice(mockDAI.address)).toString();
    const priceFTM = (await aaveOracle.getAssetPrice(mockFTM.address)).toString();
    expect(priceDAI).to.equal(DAI_PRICE);
    expect(priceFTM).to.equal(FTM_PRICE);
  });

  /**
   * This section run testing initialize pool.
   */
  it("Initial pool", async () => {
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
    const listPool = await lendingPool.getReservesList();
    expect(listPool[0]).to.equal(mockDAI.address);
    expect(listPool[1]).to.equal(mockFTM.address);

  });

  /**
   * This section run testing Deposit, Borrow, Repay and Withdraw.
   * Using dai as an asset in lending protocal.
   */
  it("Deposit, Borrow, Repay and Withdraw", async () => {

    // config pool
    await poolConfig.enableBorrowingOnReserve(mockDAI.address, true);
    await poolConfig.setReserveFactor(mockDAI.address, 5000);
    await poolConfig.configureReserveAsCollateral(
      mockDAI.address,
      7500,
      8000,
      10500
    );

    // approve and stake to lendingPool [user1]
    await mockDAI.connect(user1).approve(lendingPool.address, "20000000000000000000");
    // deposit 20 dai to lending
    await lendingPool.connect(user1).deposit(
      mockDAI.address,
      "20000000000000000000",
      user1.address,
      0
    );
    // checking collateral balance is 20$
    const user1Info = ((await lendingPool.getUserAccountData(user1.address)).totalCollateralETH).toString();
    expect(user1Info).to.equal("20000000000000000000");
    // borrow 10 dai from lending
    await lendingPool.connect(user1).borrow(
      mockDAI.address,
      "10000000000000000000",
      2,
      0,
      user1.address
    );
    // checking debt balance is 10$
    const user1Debt = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
    expect(user1Debt).to.equal("10000000000000000000");

    const varDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[9]).toString();
    const VarDebt = await ethers.getContractFactory("VariableDebtToken");
    const varDai = await VarDebt.attach(varDaiAddr);
    // approve var token for lendingPool
    await mockDAI.connect(user1).approve(lendingPool.address, "10010000000000000000");
    // repay ~ 10 dai to lending
    await lendingPool.connect(user1).repay(
      mockDAI.address,
      "10010000000000000000",
      2,
      user1.address
    );
    const user1Repay = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
    expect(user1Repay).to.equal("0");

    // check sDai balance before withdraw
    const sDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[7]).toString();
    const AToken = await ethers.getContractFactory("AToken");
    const sDai = await AToken.attach(sDaiAddr);
    const wdBalance = (await sDai.balanceOf(user1.address)).toString();
    // withdraw ~ 20 dai to lending
    await lendingPool.connect(user1).withdraw(
      mockDAI.address,
      wdBalance,
      user1.address
    );
    const user1Withdrawn = ((await lendingPool.getUserAccountData(user1.address)).totalCollateralETH).toString();
    expect(user1Withdrawn).to.equal("0");

  });

  /**
   * This section run testing Deposit, Borrow, Repay and Withdraw.
   * Using WETHGateway contract to help user interact with lending pool.
   * Using ftm as an asset in lending protocal.
   */
  it("WETH Gateway", async () => {
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
    // Deposit with 50ftm
    const signer1 = provider.getSigner(user1.address);
    await wethGW.connect(signer1).depositETH(lendingPool.address, user1.address, 0, { value: ethers.utils.parseEther("20") })
    const ftmDeposit = ((await lendingPool.getUserAccountData(user1.address)).totalCollateralETH).toString();
    // check that collateral balance is ~30$ (1ftm = 1.5$)
    expect(ftmDeposit).to.equal("30000000000000000000");

    // Borrow
    const varFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[9]).toString();
    const VarDebt = await ethers.getContractFactory("VariableDebtToken");
    const varFTM = await VarDebt.attach(varFtmAddr);
    // approveDelegation var token for WETHGateway
    await varFTM.connect(user1).approveDelegation(wethGW.address, "4000000000000000000");
    await wethGW.connect(signer1).borrowETH(lendingPool.address, "4000000000000000000", 2, 0);
    const ftmBorrow = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
    // check that collateral balance is ~6$ (1ftm = 1.5$
    expect(ftmBorrow).to.equal("6000000000000000000");

    // repay ~ 4 ftm to lending
    await wethGW.connect(signer1).repayETH(
      lendingPool.address,
      "4010000000000000000",
      2,
      user1.address,
      { value: ethers.utils.parseEther("4.01") });
    const ftmRepay = ((await lendingPool.getUserAccountData(user1.address)).totalDebtETH).toString();
    expect(ftmRepay).to.equal("0");

    // check sFTM balance before withdraw
    const sFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[7]).toString();
    const AToken = await ethers.getContractFactory("AToken");
    const sFtm = await AToken.attach(sFtmAddr);
    const wdBalance = (await sFtm.balanceOf(user1.address)).toString();
    await sFtm.connect(user1).approve(wethGW.address, wdBalance);
    // withdraw ~ 20 ftm
    await wethGW.connect(user1).withdrawETH(
      lendingPool.address,
      wdBalance,
      user1.address
    );
    const ftmWithdrawn = ((await lendingPool.getUserAccountData(user1.address)).totalCollateralETH).toString();
    expect(ftmWithdrawn).to.equal("0");

  });

  /**
   * This section run testing ChefIncentivesController.
   * Testing emission that user will receive from incentive as a sculptorToken.
   */
  it("Get reward from incentive", async () => {
    // deposit and borrow DAI
    await mockDAI.connect(user1).approve(lendingPool.address, "50000000000000000000");
    await lendingPool.connect(user1).deposit(
      mockDAI.address,
      "50000000000000000000",
      user1.address,
      0
    );
    await lendingPool.connect(user1).borrow(
      mockDAI.address,
      "20000000000000000000",
      2,
      0,
      user1.address
    );

    // deposit and borrow FTM
    const signer2 = provider.getSigner(user2.address);
    await wethGW.connect(signer2).depositETH(lendingPool.address, user2.address, 0, { value: ethers.utils.parseEther("40") })
    const varFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[9]).toString();
    const VarDebt = await ethers.getContractFactory("VariableDebtToken");
    const varFTM = await VarDebt.attach(varFtmAddr);
    // approveDelegation var token for WETHGateway
    await varFTM.connect(user2).approveDelegation(wethGW.address, "10000000000000000000");
    await wethGW.connect(signer2).borrowETH(lendingPool.address, "10000000000000000000", 2, 0);
    // check pending reward in incentive contracts
    const sFtmAddr = ((await lendingPool.getReserveData(mockFTM.address))[7]).toString();
    const sDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[7]).toString();
    const varDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[9]).toString();
    const addrList = [sDaiAddr,varDaiAddr,sFtmAddr,varFtmAddr];
    // const user1Pending = await incentive.claimableReward(user1.address, addrList);
    // const user2Pending = await incentive.claimableReward(user2.address, addrList);
    const balanceBefore = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
    const balance2Before = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
    await incentive.claim(user1.address, addrList);
    await incentive.claim(user2.address, addrList);
    // reward sending to vest in MultiFeeDistribution contract for 3 months
    const balanceAfter = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
    const balance2After = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
    const diff1 = balanceAfter.minus(balanceBefore);
    const diff2 = balance2After.minus(balance2Before);
    expect(parseInt(diff1.toFixed())).to.greaterThan(0);
    expect(parseInt(diff2.toFixed())).to.greaterThan(0);

  });

  /**
   * This section run testing Stake and Locked.
   * Testing stake sculpt and locked sculpt in masterchef.
   * Testing emission that user will receive platform fee when stake sculpt .
   * Testing emission that user will receive platform fee and pernalty fee when locked sculpt (3 months) .
   */
  it("Stake and Locked Sculpt", async () => {
    // stake token [No locked]
    await sculptorToken.connect(user1).approve(multifeedistributor.address, "200000000000000000000");
    await multifeedistributor.connect(user1).stake("200000000000000000000", false);
    const unlockedBalance = await multifeedistributor.unlockedBalance(user1.address);
    expect(unlockedBalance.toString()).to.equal("200000000000000000000");

    // deposit and borrow
    await mockDAI.connect(user1).approve(lendingPool.address, "20000000000000000000");
    await lendingPool.connect(user1).deposit(
      mockDAI.address,
      "20000000000000000000",
      user1.address,
      0
    );
    await lendingPool.connect(user1).borrow(
      mockDAI.address,
      "10000000000000000000",
      2,
      0,
      user1.address
    );

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    // repay to get platformFee
    const varDaiAddr = ((await lendingPool.getReserveData(mockDAI.address))[9]).toString();
    const VarDebt = await ethers.getContractFactory("VariableDebtToken");
    const varDai = await VarDebt.attach(varDaiAddr);
    const repay = await varDai.balanceOf(user1.address);
    await mockDAI.connect(user1).approve(lendingPool.address, repay.toString());
    await lendingPool.connect(user1).repay(
      mockDAI.address,
      repay.toString(),
      2,
      user1.address
    );

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    // stake token [locked]
    await sculptorToken.connect(user1).approve(multifeedistributor.address, "200000000000000000000");
    await multifeedistributor.connect(user1).stake("200000000000000000000", true);
    const lockedBalance = await multifeedistributor.lockedBalances(user1.address);
    expect(lockedBalance.total.toString()).to.equal("200000000000000000000");

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [21600]);
    await network.provider.send("evm_mine");

    // exit with a 50% penalty, fee to locked user
    await multifeedistributor.connect(user1).exit();

    // stake token [locked]
    await sculptorToken.connect(user2).approve(multifeedistributor.address, "200000000000000000000");
    await multifeedistributor.connect(user2).stake("200000000000000000000", true);
    // const platformFee = await multifeedistributor.claimableRewards(user1.address);
    // console.log(452, platformFee.toString());

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [21600]);
    await network.provider.send("evm_mine");

    // claimable reward
    // await multifeedistributor.connect(user1).getReward();
    // const platformFee2 = await multifeedistributor.claimableRewards(user1.address);
    // const panaltyFee2 = (platformFee2[0][1]).toString();
    // const platformFeeDai2 = (platformFee2[1][1]).toString();
    // const platformFeeFtm2 = (platformFee2[2][1]).toString();
    // expect(panaltyFee2).to.equal("0");
    // expect(platformFeeDai2).to.equal("0");
    // expect(platformFeeFtm2).to.equal("0");

    // increase block timestamp 3 months
    await network.provider.send("evm_increaseTime", [7876000]);
    await network.provider.send("evm_mine");

    const lockedExp = await multifeedistributor.lockedBalances(user1.address);
    expect(lockedExp.total.toString()).to.equal("200000000000000000000");
    // get locked sculpt after 3 mount
    const before = new BigNumber((await sculptorToken.balanceOf(user1.address)).toString());
    await multifeedistributor.connect(user1).withdrawExpiredLocks();
    const after = new BigNumber((await sculptorToken.balanceOf(user1.address)).toString());
    const diff = after.minus(before)
    const lockedBalanceExp = await multifeedistributor.lockedBalances(user1.address);

    expect(lockedBalanceExp.total.toString()).to.equal("0");
    expect(diff.toFixed()).to.equal("200000000000000000000");


  });

  it("Test function withdrawExpiredLocks()", async () => {

    // stake token [locked]
    await sculptorToken.connect(user1).approve(multifeedistributor.address, "50000000000000000000000");
    await multifeedistributor.connect(user1).stake("100000000000000000000", true);

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*7]);
    await network.provider.send("evm_mine");

    await multifeedistributor.connect(user1).stake("200000000000000000000", true);
    // const lockedBalance2 = (await multifeedistributor.lockedBalances(user1.address)).toString();

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*35]);
    await network.provider.send("evm_mine");

    await multifeedistributor.connect(user1).stake("300000000000000000000", true);

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*8]);
    await network.provider.send("evm_mine");

    await multifeedistributor.connect(user1).stake("400000000000000000000", true);
    const lockedBalance = (await multifeedistributor.lockedBalances(user1.address)).toString();

    console.log(528, lockedBalance);
    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*30]);
    await network.provider.send("evm_mine");

    await multifeedistributor.connect(user1).stake("500000000000000000000", true);
    // const lockedBalance3 = (await multifeedistributor.lockBalanceUser(user1.address)).toString();


    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*30*3]);
    await network.provider.send("evm_mine");

    // get locked sculpt after 3 mount
    const before = new BigNumber((await sculptorToken.balanceOf(user1.address)).toString());
    await multifeedistributor.connect(user1).withdrawExpiredLocks();
    const after = new BigNumber((await sculptorToken.balanceOf(user1.address)).toString());
    const diff = after.minus(before).toString()
    // const lockedBalanceExp = (await multifeedistributor.lockBalanceUser(user1.address)).toString();
    const lockedBalanceExp = (await multifeedistributor.lockedBalances(user1.address)).toString();

   
    // console.log(556, lockedBalancel);
    console.log(557, diff, "==> ", lockedBalanceExp);

    // // increase block timestamp
    // await network.provider.send("evm_increaseTime", [86400*30]);
    // await network.provider.send("evm_mine");

    // await multifeedistributor.connect(user1).stake("600000000000000000000", true);
    // const lockedBalance4 = (await multifeedistributor.lockBalanceUser(user1.address)).toString();

    // console.log(562, lockedBalance4);

    // // increase block timestamp
    // await network.provider.send("evm_increaseTime", [86400*30*2]);
    // await network.provider.send("evm_mine");

    // await multifeedistributor.connect(user1).withdrawExpiredLocks();
    // const lockedBalanceExp2 = (await multifeedistributor.lockBalanceUser(user1.address)).toString();

    // console.log(571, lockedBalanceExp2);
    
    

  });


});
