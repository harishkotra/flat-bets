import { ethers, network } from "hardhat";
import { CHAIN_ID, FEEDS, WIF, readDeployment, writeDeployment } from "./lib";

/**
 * Deploys FlatBets and seeds the first markets.
 *
 *   npx hardhat run scripts/deploy.ts --network robinhood
 *
 * Nothing here is simulated: every number printed is read from the chain after
 * the transaction is mined, and everything is written to deployments/*.json so
 * the frontend and the submission can point at real hashes.
 */
const CREATION_FEE = ethers.parseUnits("250", 18); // 250 WIF ≈ $0.32 at time of writing

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) throw new Error(`wrong chain: ${net.chainId}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  const wif = await ethers.getContractAt("MockWIF", WIF); // only for balanceOf/decimals
  const wifBalance = await wif.balanceOf(deployer.address);
  console.log("network   ", network.name, Number(net.chainId));
  console.log("deployer  ", deployer.address);
  console.log("eth       ", ethers.formatEther(balance));
  console.log("wif       ", ethers.formatUnits(wifBalance, 18));

  const existing = readDeployment();
  if (existing?.address) {
    console.log("already deployed at", existing.address);
  }

  const Factory = await ethers.getContractFactory("FlatBets");
  const gasPrice = (await ethers.provider.getFeeData()).gasPrice ?? 0n;
  const deployTx = await Factory.getDeployTransaction(WIF, CREATION_FEE);
  const deployGas = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  console.log("deploy gas", deployGas.toString(), "cost eth", ethers.formatEther(deployGas * gasPrice));

  const fb = await Factory.deploy(WIF, CREATION_FEE);
  const receipt = await fb.waitForDeployment();
  const tx = fb.deploymentTransaction()!;
  const rc = await tx.wait();
  const address = await fb.getAddress();

  const record = {
    chainId: CHAIN_ID,
    contract: "FlatBets",
    address,
    wif: WIF,
    creationFee: CREATION_FEE.toString(),
    deployer: deployer.address,
    txHash: tx.hash,
    blockNumber: rc?.blockNumber,
    gasUsed: rc?.gasUsed.toString(),
    gasPrice: tx.gasPrice?.toString(),
    costEth: ethers.formatEther((rc?.gasUsed ?? 0n) * (tx.gasPrice ?? 0n)),
    explorer: `https://robinhoodchain.blockscout.com/address/${address}`,
    deployedAt: new Date().toISOString(),
    compiler: "0.8.24",
  };
  writeDeployment("flatbets", record);
  console.log("deployed  ", address);
  console.log("tx        ", tx.hash);

  const stats = await fb.stats();
  console.log("markets   ", stats.markets_.toString(), "supply held", ethers.formatUnits(stats.wifSupply_, 18));
  receipt;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
