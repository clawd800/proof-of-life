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
    const targetUrl = resolveUri(uri);
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Fallback for CORS or other fetch errors using allorigins.win
      const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8_000) });
      if (!fallbackRes.ok) return null;
      const data = await fallbackRes.json();
      if (!data.contents) return null;
      return JSON.parse(data.contents);
    }
  } catch {
    return null;
  }
}

const registry = { address: CONTRACTS.IDENTITY, abi: IDENTITY_ABI } as const;

/**
 * Fetch agent profiles from ERC-8004 metadata.
 * Accepts agentId map directly (from getAgentList) to skip tokenOfOwnerByIndex calls.
 */
export function useAgentProfiles(agentIdMap: Map<string, bigint>) {
  const entries = [...agentIdMap.entries()]; // [addr, agentId][]

  return useQuery({
    queryKey: ["agentProfiles", entries.map(([a, id]) => `${a}:${id}`).join(",")],
    queryFn: async (): Promise<Map<string, AgentProfile>> => {
      if (entries.length === 0) return new Map();

      // agentId = tokenId in ERC-8004, use directly for tokenURI
      const batchSize = 100;
      const uriResults: any[] = [];
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const batchResults = await publicClient.multicall({
          contracts: batch.map(([, agentId]) => ({
            ...registry,
            functionName: "tokenURI" as const,
            args: [agentId] as const,
          })),
          allowFailure: true,
        });
        uriResults.push(...batchResults);
      }

      const profiles = new Map<string, AgentProfile>();
      const metaFetches = entries.map(async ([addr, agentId], i) => {
        const uriResult = uriResults[i];
        if (uriResult.status !== "success" || !uriResult.result) return;

        const meta = await fetchMetadata(uriResult.result as string);
        if (!meta?.name) return;

        profiles.set(addr.toLowerCase(), {
          tokenId: agentId,
          name: meta.name,
          image: meta.image ? resolveUri(meta.image) : null,
          description: meta.description ?? null,
          scanUrl: `${ERC8004_SCAN_BASE}/${agentId}`,
        });
      });

      await Promise.allSettled(metaFetches);
      return profiles;
    },
    enabled: entries.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
