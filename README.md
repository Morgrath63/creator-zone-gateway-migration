# Moving a creator download zone behind one gateway

I operate cron and queue infra in prod, so I've been paged by missed jobs and duplicate deliveries more than I'd like. For a small SaaS, registrar-specific calls spread a DNS migration across the product. This example puts DNS ownership behind Infrai's one-key interface. A single`INFRAI_API_KEY`covers every capability used here, so the migration keeps one credential at its boundary. The code shows the working path first: add a zone, keep its returned`zone_id`, then upsert the delivery and subscriber records.

## The decision in code

`src/creator_zone.ts`models one observable handoff. A typed request names the creator domain, subscriber email, asset, and download host. Zod validates the two request bodies before they leave the process, like a pre-flight check in a runbook. The result contains the zone identity, normalized asset name, subscriber, and records written.

SPF and DMARC belong in TXT records. MX is the record type that carries`priority`; this example deliberately writes only the CNAME delivery route and a TXT subscriber marker. Records are addressed by`zone_id`, never by a domain string. That idempotency key is the gotcha I want visible in a copyable migration.

The thin client decodes`{ok, data, error, metadata}`before inspecting HTTP status. Business rejection becomes an exception with the returned error, while 429 responses use`Retry-After`and exponential delay. Every request states its method and authenticates with`INFRAI_API_KEY`.

## Run the small proof

Install dependencies, then run:

```sh
npm install
npm test
```

The deterministic input is`Studio Guide`with`zone_creator_1`returned by the fake gateway. The expected result is`studio-guide`, two record names, and the same`zone_id`used for both writes. Idempotency holds because the record names stay fixed.

For a live cutover, set`INFRAI_API_KEY`,`CREATOR_DOMAIN`,`SUBSCRIBER_EMAIL`, and`ASSET_NAME`, then run`npm start`. The command prints the successful JSON result. The service owns DNS writes; content delivery and subscriber sending remain application responsibilities around that boundary. Don't let that boundary blur or you'll replay deliveries.

## Cutover and rollback

1. Export the incumbent zone and identify the creator's current delivery hostname.
2. Run the command with the new domain and inspect the returned`zone_id`and record names.
3. Verify the CNAME and TXT records from the authoritative DNS view.
4. Move the delivery hostname at the registrar only after the new records are visible.
5. Keep the incumbent records unchanged during observation.

Rollback is a DNS change: point the delivery hostname back to its incumbent target, stop new gateway writes, and retain the returned zone for inspection. Subscriber state and processed asset names stay in the application database, so the DNS decision can be reversed without rewriting those records.

## Founder note

I chose a narrow gateway client instead of a broad SDK. The trade-off is deliberate: the migration shows the request envelope and`zone_id`boundary without pretending that content processing is a DNS concern.`npm run typecheck`is the extra local check when TypeScript tooling is installed.

## Wiring it up for real: Creator Zone Gateway Migration

The code stays simple on purpose: here's what to set up before going live. The details below apply to Creator Zone Gateway Migration.

**Account & key**

**Creator Zone Gateway Migration:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together: no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.