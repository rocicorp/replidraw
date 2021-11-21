import { ReplicacheTransaction } from "./replicache-transaction";
import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { EntryCache } from "./entry-cache";
import { DBStorage } from "./db-storage";
import { createDatabase } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("ReplicacheTransaction", async () => {
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "c1", 1);
    const entryCache = new EntryCache(storage);
    const writeTx = new ReplicacheTransaction(entryCache, "c1");

    expect(await writeTx.has("foo")).to.be.false;
    expect(await writeTx.get("foo")).to.be.undefined;

    await writeTx.put("foo", "bar");
    expect(await writeTx.has("foo")).to.be.true;
    expect(await writeTx.get("foo")).to.equal("bar");

    // They don't overlap until one flushes and the other is reloaded.
    const writeTx2 = new ReplicacheTransaction(new EntryCache(storage), "c1");
    expect(await writeTx2.has("foo")).to.be.false;
    expect(await writeTx2.get("foo")).to.be.undefined;

    // TODO: scan, isEmpty

    // Go ahead and flush one
    await entryCache.flush();
    const writeTx3 = new ReplicacheTransaction(entryCache, "c1");
    expect(await writeTx3.has("foo")).to.be.true;
    expect(await writeTx3.get("foo")).to.equal("bar");

    // delete has special return value
    expect(await writeTx3.del("foo")).to.be.true;
    expect(await writeTx3.del("bar")).to.be.false;
  });
});
