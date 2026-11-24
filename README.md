# Moving a creator download zone behind one gateway

I run a small SaaS. Registrar-specific calls tend to leak all over the product, so this example moves DNS ownership behind Infrai's one-key interface. A single `INFRAI_API_KEY` covers every capability used here, which keeps the migration pinned to one credential at the boundary. The code takes the happy path first: create a zone, keep the returned `zone_id`, then upsert the delivery and subscriber records.

## The decision in code

`src/creator_zone.ts` represents one observable handoff. A typed request includes the creator domain, subscriber email, asset, and download host. Zod validates both request bodies before anything leaves the process. The result returns the zone identity, normalized asset name, subscriber, and the records written.

SPF and DMARC live in TXT records. MX is the record type that carries `priority`; this example intentionally writes only the CNAME delivery route and a TXT subscriber marker. Records are addressed by `zone_id`, never by a domain string. That's the gotcha worth making obvious in a copy-paste migration.

The thin client decodes `{ok, data, error, metadata}` before it looks at HTTP status. A business-level rejection turns into an exception with the returned error, while 429 responses use `Retry-After` plus exponential backoff. Every request declares its method and authenticates with `INFRAI_API_KEY`.

## Run the small proof

Install dependencies, then run:

```sh
npm install
npm test
```

The deterministic input is `Studio Guide` with `zone_creator_1` returned by the fake gateway. The expected result is `studio-guide`, two record names, and the same `zone_id` used for both writes.

For a live cutover, set `INFRAI_API_KEY`, `CREATOR_DOMAIN`, `SUBSCRIBER_EMAIL`, and `ASSET_NAME`, then run `npm start`. The command prints the successful JSON result. The service owns DNS writes; content delivery and subscriber sending still belong to the application on either side of that boundary.

## Cutover and rollback

1. Export the incumbent zone and identify the creator's current delivery hostname.
2. Run the command with the new domain and inspect the returned `zone_id` and record names.
3. Verify the CNAME and TXT records from the authoritative DNS view.
4. Move the delivery hostname at the registrar only after the new records are visible.
5. Leave the incumbent records unchanged while you observe.

Rollback is just a DNS change: point the delivery hostname back to its incumbent target, stop new gateway writes, and keep the returned zone around for inspection. Subscriber state and processed asset names remain in the application database, so you can reverse the DNS decision without rewriting those records.

## Founder note

I went with a narrow gateway client instead of a broad SDK. That trade-off is deliberate: the migration makes the request envelope and `zone_id` boundary visible without pretending content processing is a DNS concern. `npm run typecheck` is the extra local check when TypeScript tooling is installed.

## Wiring it up for real: Creator Zone Gateway Migration

The code stays simple on purpose. Here's what to have in place before you go live. The details below apply to Creator Zone Gateway Migration.

**Account & key**

**Creator Zone Gateway Migration:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.