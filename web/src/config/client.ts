import { createPublicClient, http, fallback } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_ENDPOINTS } from "./rpcs";

export const publicClient = createPublicClient({
  chain: base,
  transport: fallback(
    BASE_RPC_ENDPOINTS.map((url) =>
      http(url, { timeout: 3_000, retryCount: 0, batch: true })
    ),
    { rank: false }
  ),
});
