import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/config/client";
import { CONTRACTS, IDENTITY_ABI, ERC8004_SCAN_BASE } from "@/config/contracts";

export interface AgentProfile {
  tokenId: bigint;
  name: string;
  image: string | null;
  description: string | null;
  scanUrl: string;
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAY + uri.slice(7);
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function parseDataUri(uri: string): unknown | null {
  if (!uri.startsWith("data:")) return null;
  const commaIdx = uri.indexOf(",");
  if (commaIdx === -1) return null;
  const meta = uri.slice(5, commaIdx);
  const body = uri.slice(commaIdx + 1);
  try {
    if (meta.includes("base64")) return JSON.parse(atob(body));
    return JSON.parse(decodeURIComponent(body));
  } catch {
    return null;
  }
}

async function fetchMetadata(uri: string): Promise<{ name?: string; image?: string; description?: string } | null> {
  const inline = parseDataUri(uri);
  if (inline) return inline as { name?: string; image?: string; description?: string };
  try {
    const res = await fetch(resolveUri(uri), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const registry = { address: CONTRACTS.IDENTITY, abi: IDENTITY_ABI } as const;

export function useAgentProfiles(addresses: `0x${string}`[]) {
  return useQuery({
    queryKey: ["agentProfiles", addresses.join(",")],
    queryFn: async (): Promise<Map<string, AgentProfile>> => {
      if (addresses.length === 0) return new Map();

      const tokenIdResults = await publicClient.multicall({
        contracts: addresses.map((addr) => ({
          ...registry,
          functionName: "tokenOfOwnerByIndex" as const,
          args: [addr, 0n] as const,
        })),
        allowFailure: true,
      });

      const registered: { addr: string; tokenId: bigint }[] = [];
      for (let i = 0; i < addresses.length; i++) {
        const r = tokenIdResults[i];
        if (r.status === "success" && r.result != null) {
          registered.push({ addr: addresses[i], tokenId: r.result as bigint });
        }
      }

      if (registered.length === 0) return new Map();

      const uriResults = await publicClient.multicall({
        contracts: registered.map(({ tokenId }) => ({
          ...registry,
          functionName: "tokenURI" as const,
          args: [tokenId] as const,
        })),
        allowFailure: true,
      });

      const profiles = new Map<string, AgentProfile>();
      const metaFetches = registered.map(async ({ addr, tokenId }, i) => {
        const uriResult = uriResults[i];
        if (uriResult.status !== "success" || !uriResult.result) return;

        const meta = await fetchMetadata(uriResult.result as string);
        if (!meta?.name) return;

        profiles.set(addr.toLowerCase(), {
          tokenId,
          name: meta.name,
          image: meta.image ? resolveUri(meta.image) : null,
          description: meta.description ?? null,
          scanUrl: `${ERC8004_SCAN_BASE}/${tokenId}`,
        });
      });

      await Promise.allSettled(metaFetches);
      return profiles;
    },
    enabled: addresses.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
