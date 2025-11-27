import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import abiJson from "./abi/TimelockVault.json";
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL, START_BLOCK } from "./config";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const short = (value = "") => `${value.slice(0, 6)}...${value.slice(-4)}`;

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState();
  const [signer, setSigner] = useState();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [refreshFlag, setRefreshFlag] = useState(0);

  const readProvider = useMemo(() => (RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : undefined), []);
  const providerContract = useMemo(() => {
    if (!readProvider) return undefined;
    return new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, readProvider);
  }, [readProvider]);

  const signerContract = useMemo(() => {
    if (!signer) return undefined;
    return new ethers.Contract(CONTRACT_ADDRESS, abiJson.abi, signer);
  }, [signer]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!providerContract) return;
      try {
        const fromBlock = START_BLOCK || 0;
        const events = await providerContract.queryFilter(
          providerContract.filters.DepositCreated(),
          fromBlock
        );
        const last = events.slice(-25).reverse();
        const rows = await Promise.all(
          last.map(async (evt) => {
            const depositId = Number(evt.args.depositId);
            const data = await providerContract.getDeposit(depositId);
            return {
              depositId,
              depositor: evt.args.depositor,
              beneficiary: evt.args.beneficiary,
              token: evt.args.token,
              amount: evt.args.amount,
              unlockTime: Number(evt.args.unlockTime),
              withdrawn: data.withdrawn,
            };
          })
        );
        setHistory(rows);
      } catch (err) {
        console.error(err);
      }
    };
    fetchHistory();
  }, [providerContract, refreshFlag]);

  const connect = async () => {
    setError("");
    if (!window.ethereum) {
      setError("No wallet detected (install MetaMask)");
      return;
    }
    try {
      const nextProvider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ethers.toBeHex(CHAIN_ID) }],
        });
      } catch (switchErr) {
        console.warn("Chain switch warning", switchErr);
      }
      const signer = await nextProvider.getSigner();
      const network = await nextProvider.getNetwork();
      setSigner(signer);
      setAccount(await signer.getAddress());
      setChainId(Number(network.chainId));
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to connect wallet");
    }
  };

  const handleDepositEth = async (e) => {
    e.preventDefault();
    if (!signerContract) return setError("Connect wallet first");
    const form = new FormData(e.target);
    const beneficiary = String(form.get("beneficiary"));
    const amountEth = String(form.get("amount"));
    const unlock = String(form.get("unlock"));
    const unlockTime = Math.floor(new Date(unlock).getTime() / 1000);
    try {
      setStatus("Sending ETH deposit...");
      const tx = await signerContract.depositEth(beneficiary, unlockTime, {
        value: ethers.parseEther(amountEth || "0"),
      });
      await tx.wait();
      setStatus("Deposit confirmed");
      setRefreshFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      setError(err.shortMessage || err.message);
    } finally {
      setStatus("");
    }
  };

  const handleDepositErc20 = async (e) => {
    e.preventDefault();
    if (!signerContract) return setError("Connect wallet first");
    const form = new FormData(e.target);
    const tokenAddress = String(form.get("token"));
    const amount = String(form.get("amount"));
    const beneficiary = String(form.get("beneficiary"));
    const unlock = String(form.get("unlock"));
    const unlockTime = Math.floor(new Date(unlock).getTime() / 1000);

    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const decimals = await token.decimals();
      const parsed = ethers.parseUnits(amount || "0", decimals);
      const allowance = await token.allowance(account, CONTRACT_ADDRESS);
      if (allowance < parsed) {
        setStatus("Approving token...");
        const approveTx = await token.approve(CONTRACT_ADDRESS, parsed);
        await approveTx.wait();
      }
      setStatus("Sending ERC20 deposit...");
      const tx = await signerContract.depositERC20(tokenAddress, parsed, beneficiary, unlockTime);
      await tx.wait();
      setStatus("Deposit confirmed");
      setRefreshFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      setError(err.shortMessage || err.message);
    } finally {
      setStatus("");
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!signerContract) return setError("Connect wallet first");
    const id = Number(new FormData(e.target).get("id"));
    try {
      setStatus("Withdrawing...");
      const tx = await signerContract.withdraw(id);
      await tx.wait();
      setStatus("Withdrawn");
      setRefreshFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      setError(err.shortMessage || err.message);
    } finally {
      setStatus("");
    }
  };

  const handleExtend = async (e) => {
    e.preventDefault();
    if (!signerContract) return setError("Connect wallet first");
    const form = new FormData(e.target);
    const id = Number(form.get("id"));
    const unlock = String(form.get("unlock"));
    const unlockTime = Math.floor(new Date(unlock).getTime() / 1000);
    try {
      setStatus("Extending lock...");
      const tx = await signerContract.extendLock(id, unlockTime);
      await tx.wait();
      setStatus("Extended");
      setRefreshFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      setError(err.shortMessage || err.message);
    } finally {
      setStatus("");
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Timelock Vault</p>
          <h1>Lock ETH or tokens until the future.</h1>
          <p className="sub">Multi-beneficiary, per-deposit unlocks, with pause + upgradeable proxy.</p>
          <div className="meta">
            <span>Proxy: {CONTRACT_ADDRESS === "0xYourProxyAddress" ? "Set address" : short(CONTRACT_ADDRESS)}</span>
            <span>Chain: {chainId || "?"}</span>
          </div>
        </div>
        <button className="primary" onClick={connect}>{account ? short(account) : "Connect"}</button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {status && <div className="banner info">{status}</div>}

      <section className="grid">
        <div className="card">
          <h2>Deposit ETH</h2>
          <form onSubmit={handleDepositEth} className="form">
            <label>
              Beneficiary
              <input name="beneficiary" placeholder="0x..." required />
            </label>
            <label>
              Amount (ETH)
              <input name="amount" type="number" step="0.0001" min="0" required />
            </label>
            <label>
              Unlock date/time
              <input name="unlock" type="datetime-local" required />
            </label>
            <button className="primary" type="submit">Lock ETH</button>
          </form>
        </div>

        <div className="card">
          <h2>Deposit ERC20</h2>
          <form onSubmit={handleDepositErc20} className="form">
            <label>
              Token address
              <input name="token" placeholder="0xToken" required />
            </label>
            <label>
              Amount
              <input name="amount" type="number" step="0.000001" min="0" required />
            </label>
            <label>
              Beneficiary
              <input name="beneficiary" placeholder="0x..." required />
            </label>
            <label>
              Unlock date/time
              <input name="unlock" type="datetime-local" required />
            </label>
            <button className="primary" type="submit">Lock Tokens</button>
          </form>
        </div>

        <div className="card">
          <h2>Withdraw</h2>
          <form onSubmit={handleWithdraw} className="form">
            <label>
              Deposit ID
              <input name="id" type="number" min="1" required />
            </label>
            <button type="submit">Withdraw</button>
          </form>
          <h2 className="mt">Extend Lock</h2>
          <form onSubmit={handleExtend} className="form">
            <label>
              Deposit ID
              <input name="id" type="number" min="1" required />
            </label>
            <label>
              New unlock
              <input name="unlock" type="datetime-local" required />
            </label>
            <button type="submit">Extend</button>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="history-header">
          <h2>Recent activity</h2>
          <button onClick={() => setRefreshFlag((x) => x + 1)}>Refresh</button>
        </div>
        <div className="table">
          <div className="row head">
            <span>ID</span>
            <span>Beneficiary</span>
            <span>Token</span>
            <span>Amount</span>
            <span>Unlock</span>
            <span>Status</span>
          </div>
          {history.length === 0 && <div className="row">No deposits yet.</div>}
          {history.map((item) => (
            <div key={item.depositId} className="row">
              <span>{item.depositId}</span>
              <span title={item.beneficiary}>{short(item.beneficiary)}</span>
              <span title={item.token}>{item.token === ethers.ZeroAddress ? "ETH" : short(item.token)}</span>
              <span>{item.token === ethers.ZeroAddress ? ethers.formatEther(item.amount || 0n) : (item.amount?.toString?.() || "0")}</span>
              <span>{new Date(item.unlockTime * 1000).toLocaleString()}</span>
              <span className={item.withdrawn ? "pill done" : "pill pending"}>{item.withdrawn ? "Withdrawn" : "Locked"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
