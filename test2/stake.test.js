const { expect } = require("chai");
const { ethers } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Masterchef Deployed", function () {

  const startTimeOffset = ["0","604800","94620000"];
  const rewardsPerSecond = ["500000000000000000","209515057140000000","0"];
  const maxMintable = "20000000000000000000000000";

  let deployer, user1, user2;
  let sculptorToken;
  let stakeToken;
  let multifeedistributor;
  let masterchef;

      before(async () => {
         [deployer, user1, user2] = await ethers.getSigners();
         // deploy Relate contract
         const SculptorToken = await ethers.getContractFactory("SculptorToken");
         sculptorToken = await SculptorToken.deploy();
         const MultiFee = await ethers.getContractFactory("MultiFeeDistribution");
         multifeedistributor = await MultiFee.deploy(sculptorToken.address);
         const Chef = await ethers.getContractFactory("MasterChef");
         masterchef = await Chef.deploy(
           startTimeOffset,
           rewardsPerSecond,
           deployer.address,
           multifeedistributor.address,
           maxMintable
         );
         const MockToken = await ethers.getContractFactory("MockERC20");
         stakeToken = await MockToken.deploy();

         // setMinter function for give permission to masterchef contract that can mint token
         await multifeedistributor.setMinters([deployer.address, masterchef.address]);

      });

      /**
       * This section run testing Stake and Claim reward.
       * Testing stake lp in mastercheft
       * Testing emission that user will receive as a sculpt token .
       * Testing vesting reward from masterchef (3 months).
       */
      it("Prepare StakeToken, add new pool, stake and claim rewards", async () => {
        // mint stake token for user1 and user2
        await stakeToken.mint(user1.address,"500000000000000000000");
        await stakeToken.mint(user2.address,"500000000000000000000");
        const balanceUser1 = (await stakeToken.balanceOf(user1.address)).toString()
        const balanceUser2 = (await stakeToken.balanceOf(user2.address)).toString()
        expect(balanceUser1).to.equal("500000000000000000000");
        expect(balanceUser2).to.equal("500000000000000000000");

        // add new pool for stake token
        await masterchef.addPool(stakeToken.address, 100);
        let pooInfo = await masterchef.poolInfo(stakeToken.address);
        expect((pooInfo.allocPoint).toString()).to.equal("100");

        // start reward
        await masterchef.start();
        // approve and stake to masterchef [user1]
        await stakeToken.connect(user1).approve(masterchef.address, "2000000000000000000");
        await masterchef.connect(user1).deposit(stakeToken.address, "2000000000000000000");
        // increase block timestamp
        await network.provider.send("evm_increaseTime", [3600]);
        await network.provider.send("evm_mine")
        // console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
        await masterchef.connect(user1).withdraw(stakeToken.address, "1000000000000000000");
        // approve and stake to masterchef [user2]
        await stakeToken.connect(user2).approve(masterchef.address, "3000000000000000000");
        await masterchef.connect(user2).deposit(stakeToken.address, "3000000000000000000");
        // reward per second must greater than 0
        const rewardPerSec = (await masterchef.rewardsPerSecond()).toString()
        expect(parseInt(rewardPerSec)).to.greaterThan(0);
        // checking user1 balance after deposit and withdraw
        let userInfo = await masterchef.userInfo(stakeToken.address, user1.address);
        expect((userInfo.amount).toString()).to.equal("1000000000000000000");
        // increase block timestamp
        await network.provider.send("evm_increaseTime", [604800]);
        await network.provider.send("evm_mine")
        // approve and stake to masterchef [user2]
        await stakeToken.connect(user2).approve(masterchef.address, "3000000000000000000");
        await masterchef.connect(user2).deposit(stakeToken.address, "3000000000000000000");
        // checking reward per second after increase block timestamp for 7 days
        const rewardPerSec2 = (await masterchef.rewardsPerSecond()).toString()
        expect(rewardPerSec2).to.equal("209515057140000000");

        // increase block timestamp
        await network.provider.send("evm_increaseTime", [95620000]);
        await network.provider.send("evm_mine")
        const balanceBefore = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
        // claim reward [user2]
        await masterchef.connect(user2).claim(user2.address, [stakeToken.address]);
        // reward sending to vest in MultiFeeDistribution contract for 3 months
        const balanceAfter = new BigNumber((await multifeedistributor.earnedBalances(user2.address)).total.toString())
        const diff = balanceAfter.minus(balanceBefore);
        expect(parseInt(diff.toFixed())).to.greaterThan(0);

        // checking reward per second after increase block timestamp for 3 years
        const rewardPerSec3 = (await masterchef.rewardsPerSecond()).toString()
        expect(rewardPerSec3).to.equal("0");

      });

});
