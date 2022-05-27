const { expect } = require("chai");
const { ethers } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Token And MultiFeeDistribution Deployed", function () {

      const initAmount = 28500000000000000000000000;
      const decimals = 18
      const symbol = "SCULPT";

      let deployer, user1, user2;
      let sculptorToken;
      let multifeedistributor;
      let minter1, minter2;

      before(async () => {
         [deployer, user1, user2] = await ethers.getSigners();
         // deploy Scupltor Token and MultiFeeDistribution contract
         const SculptorToken = await ethers.getContractFactory("SculptorToken");
         sculptorToken = await SculptorToken.deploy();
         const MultiFee = await ethers.getContractFactory("MultiFeeDistribution");
         multifeedistributor = await MultiFee.deploy(sculptorToken.address);

      });
    
      it("correctly constructs an ERC20", async () => {
        expect(await sculptorToken.symbol()).to.equal(symbol);
        expect(await sculptorToken.decimals()).to.equal(decimals);
        expect(await sculptorToken.minter()).to.equal(multifeedistributor.address);
        const initBalance = (await sculptorToken.balanceOf(deployer.address)).toString();
        expect(BigNumber(initBalance).toFixed()).to.equal(BigNumber(initAmount).toFixed());
      });

      it("correctly set minter and mintable token", async () => {
        // setMinter function for give permission address or contract to mint token
        await multifeedistributor.setMinters([deployer.address,user1.address,user2.address]);
        // checking mintersAreSet is true after set minter
        const mintSet = await multifeedistributor.mintersAreSet();
        const setMint1 = await multifeedistributor.minters(user1.address);
        const setMint2 = await multifeedistributor.minters(user2.address);
        expect(mintSet.toString()).to.equal("true");
        expect(setMint1.toString()).to.equal("true");
        expect(setMint2.toString()).to.equal("true");
        // mint token to deployer
        await multifeedistributor.mint(deployer.address,"1000000000000000000",false);
        // checking balance that contract is correcly mint to deployer
        const beforeMint = new BigNumber((await sculptorToken.balanceOf(deployer.address)).toString())
        await multifeedistributor.exit();
        const afterMint = new BigNumber((await sculptorToken.balanceOf(deployer.address)).toString());
        const diff = afterMint.minus(beforeMint)
        expect(diff.toFixed()).to.equal(new BigNumber("1000000000000000000").toFixed());

      });

});
