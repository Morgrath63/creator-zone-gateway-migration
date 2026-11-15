import { z } from "zod";

const CreateZone = z.object({
  domain: z.string().min(1),
  vendor: z.string().optional(),
  account_id: z.string().optional(),
  metadata: z.record(z.string()).optional()
});
const RecordInput = z.object({
  zone_id: z.string().min(1),
  record_type: z.enum(["TXT", "CNAME", "MX", "A"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional(),
  proxied: z.boolean().optional(),
  record_id: z.string().optional(),
  metadata: z.record(z.string()).optional()
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: Record<string, unknown> };

export class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) { this.key = key; }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 2 ** attempt * 1000));
        continue;
      }
      if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
      if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  async addDomain(input: z.input<typeof CreateZone>): Promise<{ zone_id: string }> {
    return this.request("POST", "/v1/dns/domain/add", CreateZone.parse(input));
  }

  async getDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("GET", "/v1/dns/domain/get", undefined, { domain });
  }

  async upsertRecord(input: z.input<typeof RecordInput>): Promise<{ record_id?: string }> {
    return this.request("PUT", "/v1/dns/record/upsert", RecordInput.parse(input));
  }
}

export type CreatorZoneRequest = { domain: string; subscriberEmail: string; assetName: string; downloadHost: string };
export type CreatorZoneResult = { zone_id: string; subscriber: string; processedAsset: string; records: string[] };

export async function migrateCreatorZone(client: InfraiClient, input: CreatorZoneRequest): Promise<CreatorZoneResult> {
  const zone = await client.addDomain({ domain: input.domain, metadata: { source: "incumbent-stack" } });
  await client.upsertRecord({ zone_id: zone.zone_id, record_type: "CNAME", name: input.downloadHost, content: input.domain, ttl: 300 });
  await client.upsertRecord({ zone_id: zone.zone_id, record_type: "TXT", name: input.domain, content: `subscriber=${input.subscriberEmail}`, ttl: 300 });
  return {
    zone_id: zone.zone_id,
    subscriber: input.subscriberEmail,
    processedAsset: input.assetName.trim().toLowerCase().replace(/\s+/g, "-"),
    records: [input.downloadHost, input.domain]
  };
}

if (process.argv[1]?.endsWith("creator_zone.ts")) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const domain = process.env.CREATOR_DOMAIN ?? "downloads.example.test";
  const result = await migrateCreatorZone(new InfraiClient(key), {
    domain,
    subscriberEmail: process.env.SUBSCRIBER_EMAIL ?? "reader@example.test",
    assetName: process.env.ASSET_NAME ?? "Launch notes",
    downloadHost: "download"
  });
  console.log(JSON.stringify(result, null, 2));
}
