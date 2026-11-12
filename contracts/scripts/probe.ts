import { ethers } from "hardhat";
import { CHAIN_ID, WIF } from "./lib";

/**
 * Dry run. Prints exactly what the deployer needs before anything is signed:
 * deploy gas, per-market gas, and the ETH balance gap at current gas price.
 *
 *   npx hardhat run scripts/probe.ts --network robinhood
 */
const CREATION_FEE = ethers.parseUnits("250", 18);

async function main() {
  const signers = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("FlatBets");
  const tx = Factory.getDeployTransaction(WIF, CREATION_FEE);
  const deployGas = await ethers.provider.estimateGas({ ...tx, data: tx.data, from: signers[0].address });
  const fee = await ethers.provider.getFeeData();
  const gasPrice = fee.gasPrice ?? 0n;
  const wif = await ethers.getContractAt("MockWIF", WIF);
  const wifBal = await wif.balanceOf(signers[0].address);

  const MARKET_GAS = 260_000n; // measured on a mainnet fork, re-checked after deploy
  const marketBudget = MARKET_GAS * 9n;
  const totalGas = deployGas + marketBudget;
  const cost = totalGas * gasPrice;

  console.log(JSON.stringify({
    chainId: CHAIN_ID,
    deployer: signers[0].address,
    ethBalance: ethers.formatEther(await ethers.provider.getBalance(signers[0].address)),
    wifBalance: ethers.formatUnits(wifBal, 18),
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    deployGas: deployGas.toString(),
    marketGasEach: MARKET_GAS.toString(),
    totalGas: totalGas.toString(),
    estimatedEthCost: ethers.formatEther(cost),
    creationFeeWif: ethers.formatUnits(CREATION_FEE, 18),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
