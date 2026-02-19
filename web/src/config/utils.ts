import { formatUnits } from "viem";

export function fmtSeconds(totalSecs: number): string {
  if (totalSecs < 60) return `${totalSecs}s`;
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

export const fmtDuration = fmtSeconds;

export function fmtAge(epochs: bigint, epochDuration: bigint): string {
  return fmtSeconds(Number(epochs) * Number(epochDuration));
}

export function fmtUsdc(value: bigint | undefined, unit?: boolean): string {
  if (value === undefined) return "—";
  const v = formatUnits(value, 6);
  return unit ? `${v} USDC` : v;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
