const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const BigNumber = require('bignumber.js');

describe("Lock Drop", function () {

  const provider = waffle.provider;
  const duration = ["60000","90000","180000"];
  const multiplier = ["1","3","6"];
  const stakeMint = "5000000000000000000000"; // 5000
  let deployer, user1, user2, user3, user4;
  let rewardToken, stakedToken, lockDrop;

  before(async () => {
    [deployer, user1, user2, user3, user4] = await ethers.getSigners();
   //  const balance0ETH = await provider.getBalance(user1.address);
   //  const balance2ETH = await provider.getBalance(user2.address);
    // deploy Relate contract
    const RewardToken = await ethers.getContractFactory("MockERC20");
    rewardToken = await RewardToken.deploy();
    const StakedToken = await ethers.getContractFactory("MockERC20");
    stakedToken = await StakedToken.deploy();
    await stakedToken.mint(user1.address, stakeMint);
    await stakedToken.mint(user2.address, stakeMint);
    await rewardToken.mint(deployer.address, stakeMint);
    // await stakedToken.mint(user3.address, stakeMint);
    // await stakedToken.mint(user4.address, stakeMint);
    const LockDrop = await ethers.getContractFactory("SculptorLockDrop");
    lockDrop = await LockDrop.deploy(stakedToken.address, rewardToken.address, duration, multiplier);
    // start deposit
    await lockDrop.start();
    

  });

  it("LockDrop Deposit", async () => {
    const bl1 = await stakedToken.balanceOf(user1.address);
    console.log(37, bl1.toString());
    await stakedToken.connect(user1).approve(lockDrop.address, "5000000000000000000000000");
    await stakedToken.connect(user2).approve(lockDrop.address, "5000000000000000000000000");
    await lockDrop.connect(user1).deposit("10000000000000000000", 0);
    await lockDrop.connect(user1).deposit("50000000000000000000", 2);
    await lockDrop.connect(user2).deposit("20000000000000000000", 0);
    await lockDrop.connect(user2).deposit("40000000000000000000", 1);

    // start deposit
    await lockDrop.end();

    const bbf1 = await stakedToken.balanceOf(user1.address);
    await lockDrop.connect(user1).withdraw();
    const baf1 = await stakedToken.balanceOf(user1.address);
    console.log(51, "Compare withdraw balance", bbf1.toString(), baf1.toString());

    const totalSupplyWeight = await lockDrop.totalSupplyWeight();
    const blld = await stakedToken.balanceOf(lockDrop.address);
    console.log(55, totalSupplyWeight.toString(), blld.toString());

    
    await rewardToken.approve(lockDrop.address, "10000000000000000000000");
    await lockDrop.startRewardPaid("100000000000000000000");

    // increase block timestamp
    await network.provider.send("evm_increaseTime", [86400*7]);
    await network.provider.send("evm_mine");

    const rbbf1 = await stakedToken.balanceOf(user2.address);
    // const rewardWeight1 = await lockDrop.calculateRewardPaid(user1.address);
    // const rewardWeight2 = await lockDrop.calculateRewardPaid(user2.address);
    await lockDrop.connect(user2).withdraw();
    await lockDrop.connect(user1).withdraw();
    const maxsp = await lockDrop.maxRewardSupply()
    const rbaf1 = await stakedToken.balanceOf(user2.address);
    console.log(65, "Compare withdraw balance", rbbf1.toString(), rbaf1.toString());
    // console.log(68, rewardWeight1.toString(), rewardWeight2.toString(), maxsp.toString());
    // // increase block timestamp
    // await network.provider.send("evm_increaseTime", [86400*14]);
    // await network.provider.send("evm_mine");

    

  });

});