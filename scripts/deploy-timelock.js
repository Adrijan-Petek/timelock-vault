const hre = require('hardhat');
require('dotenv').config();
async function main(){ const [deployer]=await hre.ethers.getSigners(); console.log('Deploying with', deployer.address); const unlock = Math.floor(Date.now()/1000) + 60*60*24; const Timelock = await hre.ethers.getContractFactory('TimelockVault'); const t = await Timelock.deploy(unlock, { value: hre.ethers.parseEther('0.1') }); await t.waitForDeployment(); console.log('TimelockVault:', await t.getAddress()); }
main().catch(e=>{console.error(e); process.exitCode=1;});
