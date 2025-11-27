const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("Set PROXY_ADDRESS in .env");

  const Timelock = await ethers.getContractFactory("TimelockVault");
  console.log("Upgrading proxy", proxyAddress);
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Timelock, { kind: "uups" });
  await upgraded.waitForDeployment();

  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", implAddress);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
