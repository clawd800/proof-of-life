import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "@/config/utils";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-mono transition-colors"
      >
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((c) => (
        <button
          key={c.uid}
          onClick={() => connect({ connector: c })}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold transition-colors"
        >
          {c.name === "Injected" ? "Connect Wallet" : c.name}
        </button>
      ))}
    </div>
  );
}
