// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable.sol";
contract TimelockVault is Ownable {
  uint256 public unlockTime;
  constructor(uint256 _unlockTime) payable { unlockTime = _unlockTime; }
  receive() external payable {}
  function withdraw(address payable to, uint256 amount) external onlyOwner {
    require(block.timestamp >= unlockTime, "locked");
    to.transfer(amount);
  }
  function extendLock(uint256 newTime) external onlyOwner { require(newTime > unlockTime, "must be later"); unlockTime = newTime; }
}
