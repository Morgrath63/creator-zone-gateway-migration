import assert from "node:assert/strict";
import { migrateCreatorZone, InfraiClient } from "./creator_zone.ts";

class FakeClient extends InfraiClient {
  constructor() { super("test-key"); }
  async addDomain() { return { zone_id: "zone_creator_1" }; }
  async upsertRecord(input: { zone_id: string; name: string }) {
    assert.equal(input.zone_id, "zone_creator_1");
    return { record_id: input.name };
  }
}

const result = await migrateCreatorZone(new FakeClient(), {
  domain: "creator.example",
  subscriberEmail: "fan@example.test",
  assetName: "  Studio Guide  ",
  downloadHost: "download"
});
assert.equal(result.zone_id, "zone_creator_1");
assert.equal(result.processedAsset, "studio-guide");
assert.deepEqual(result.records, ["download", "creator.example"]);
console.log("creator zone migration decision passed");
