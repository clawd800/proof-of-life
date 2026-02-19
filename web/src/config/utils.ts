import { formatUnits } from "viem";

/** Format USDC (6 decimals) for display */
export function fmtUsdc(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return formatUnits(value, 6);
}

/** Truncate address to 0x1234…5678 */
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Format epoch duration into human-readable string */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format age (epochs) into human-readable string given epoch duration in seconds */
export function fmtAge(epochs: bigint, epochDuration: bigint): string {
  const totalSecs = Number(epochs) * Number(epochDuration);
  if (totalSecs < 3600) return `${Math.floor(totalSecs / 60)}m`;
  if (totalSecs < 86400) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
