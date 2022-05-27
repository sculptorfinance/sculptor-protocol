const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

describe("Lending Pool and Stake Locked Sculpt Token", function () {

  const provider = waffle.provider;
  let deployer, user1, user2;
  let lendingImp, lendingVulnerableImp;
  let lendingProvider, lendingProvider2, lendingProviderAttack;

  /**
   * This section is setup relate contract for lending protocal and stake-locked sculpt.
   */
  before(async () => {
     [deployer, user1, user2] = await ethers.getSigners();

     const LendingPoolProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
     lendingProvider = await LendingPoolProvider.deploy("SCULPTOR");
     lendingProvider2 = await LendingPoolProvider.deploy("SCULPTOR");

     // deployed another provider for initialize lendingPool logic
     lendingProviderAttack = await LendingPoolProvider.deploy("SCULPTOR");

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
     const LendingVulImp = await ethers.getContractFactory("LendingPoolVulnerable", {
        libraries: {
          ValidationLogic: validateImp.address,
          ReserveLogic: reserveImp.address
        },
     });
     lendingImp = await LendingImp.deploy();
     lendingVulnerableImp = await LendingVulImp.deploy();
     
  });

  /**
   * This section run testing initialize function on LendingPool Logic.
   */
  it("Initialize LendingPool logic (attack)", async () => {

    /**
     * Config lendingPool in LendingPoolAddressesProvider.
     * Case: vulnerable lendingPool that anyone can initialize.
     */
    await lendingProvider.setPoolAdmin(deployer.address);
    await lendingProvider.setEmergencyAdmin(deployer.address);
    await lendingProvider.setLendingPoolImpl(lendingVulnerableImp.address);

    await lendingVulnerableImp.connect(user1).initialize(lendingProviderAttack.address);

  });

  /**
   * This section run testing initialize function on LendingPool Logic.
   */
   it("Initialize LendingPool logic (fixed)", async () => {

    /**
     * Config lendingPool in LendingPoolAddressesProvider.
     * Case: Fixed lendingPool initialize function.
     */
    await lendingProvider2.setPoolAdmin(deployer.address);
    await lendingProvider2.setEmergencyAdmin(deployer.address);
    await lendingProvider2.setLendingPoolImpl(lendingImp.address);

    await expect(lendingImp.initialize(lendingProviderAttack.address))
        .to.be.revertedWith("Contract instance has already been initialized");
  });

  

});
