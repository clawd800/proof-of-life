import { useEffect } from "react";

interface TxStatusProps {
  hash: `0x${string}` | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | null;
  onDone: () => void;
}

export function TxStatus({ hash, isPending, isConfirming, isSuccess, error, onDone }: TxStatusProps) {
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(onDone, 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, onDone]);

  if (!isPending && !isConfirming && !isSuccess && !error) return null;

  return (
    <div className="text-xs font-mono mt-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      {isPending && <p className="text-killable">Confirm in wallet…</p>}
      {isConfirming && (
        <p className="text-blue-400">
          Confirming{" "}
          {hash && (
            <a
              href={`https://basescan.org/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-blue-300"
            >
              {hash.slice(0, 10)}…
            </a>
          )}
        </p>
      )}
      {isSuccess && <p className="text-alive">Confirmed</p>}
      {error && (
        <p className="text-accent">
          {error.message.includes("User rejected") ? "Rejected by user" : error.message.slice(0, 80)}
        </p>
      )}
    </div>
  );
}
