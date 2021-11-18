import { ReplicacheTransaction } from "./replicache-transaction";
import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { EntryCache } from "./entry-cache";
import { PostgresStorage } from "./postgres-storage";
import { createDatabase, getObject } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("EntryCache", async () => {
  await transact(async (executor) => {
    const storage = new PostgresStorage(executor, "test");
    const entryCache = new EntryCache(storage);

    expect(await entryCache.has("foo")).to.be.false;
    expect(await entryCache.get("foo")).to.be.undefined;

    await entryCache.put("foo", "bar");
    expect(await entryCache.has("foo")).to.be.true;
    expect(await entryCache.get("foo")).to.equal("bar");

    // They don't overlap until one flushes and the other is reloaded.
    const entryCache2 = new EntryCache(storage);
    expect(await entryCache2.has("foo")).to.be.false;
    expect(await entryCache2.get("foo")).to.be.undefined;

    // They also don't show up in underlying storage.
    expect(await getObject(executor, "test", "foo")).to.be.undefined;

    // TODO: scan, isEmpty

    // Go ahead and flush one now. The change shows up in new caches and in storage.
    await entryCache.flush();
    const entryCache3 = new EntryCache(storage);
    expect(await entryCache3.has("foo")).to.be.true;
    expect(await entryCache3.get("foo")).to.equal("bar");
    expect(await getObject(executor, "test", "foo")).equal("bar");

    // stacking!
    const entryCache4 = new EntryCache(entryCache3);
    await entryCache4.put("hot", "dog");
    expect(await entryCache4.get("hot")).to.equal("dog");

    // If we don't flush, it doesn't show up in underlying storage
    expect(await entryCache3.get("hot")).to.be.undefined;

    // ... but as soon as we flush, it does.
    await entryCache4.flush();
    expect(await entryCache3.get("hot")).to.equal("dog");
  });
});
