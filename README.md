# Timelock Vault (Base)

Simple ETH timelock vault that holds funds until a specified unlock time. Includes deploy script that funds the contract.

## How to use
1. `npm ci`
2. Copy `.env.example` to `.env` and set keys
3. `npm run compile`
4. Deploy (local/testnet): `npx hardhat run scripts/deploy-timelock.js --network baseSepolia`
5. After unlock time: call `withdraw()` from owner to release funds.

## Security
- This is minimal; production vaults need multisig and timelock governance. 
