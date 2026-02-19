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
    <div className="text-sm mt-2">
      {isPending && <p className="text-yellow-400">⏳ Confirm in wallet…</p>}
      {isConfirming && (
        <p className="text-blue-400">
          ⛓ Confirming…{" "}
          {hash && (
            <a
              href={`https://basescan.org/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View tx
            </a>
          )}
        </p>
      )}
      {isSuccess && <p className="text-emerald-400">✅ Confirmed!</p>}
      {error && (
        <p className="text-red-400">
          ❌ {error.message.includes("User rejected") ? "Transaction rejected" : error.message.slice(0, 100)}
        </p>
      )}
    </div>
  );
}
