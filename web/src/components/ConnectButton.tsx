import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "@/config/utils";
import { Icon } from "./Icons";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="glass flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono text-zinc-300 hover:text-white hover:border-zinc-600 transition-all cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-alive animate-pulse-dot" />
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
          className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-red-500 rounded-lg text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] cursor-pointer"
        >
          {Icon.Wallet({ className: "w-4 h-4" })}
          {c.name === "Injected" ? "Connect" : c.name}
        </button>
      ))}
    </div>
  );
}
