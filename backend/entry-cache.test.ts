import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { EntryCache } from "./entry-cache";
import { DBStorage } from "./db-storage";
import { createDatabase, entry, getEntry } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("EntryCache", async () => {
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test");
    const entryCache = new EntryCache(storage);

    expect(await entryCache.has("foo")).to.be.false;
    expect(await entryCache.get("foo")).deep.equal(entry(undefined, 0));

    await entryCache.put("foo", "bar", 1);
    expect(await entryCache.has("foo")).to.be.true;
    expect(await entryCache.get("foo")).deep.equal(entry("bar", 1));

    // They don't overlap until one flushes and the other is reloaded.
    const entryCache2 = new EntryCache(storage);
    expect(await entryCache2.has("foo")).to.be.false;
    expect(await entryCache2.get("foo")).deep.equal(entry(undefined, 0));

    // They also don't show up in underlying storage.
    expect(await getEntry(executor, "test", "foo")).deep.equal(
      entry(undefined, 0)
    );

    // TODO: scan, isEmpty

    // Go ahead and flush one now. The change shows up in new caches and in storage.
    await entryCache.flush();
    const entryCache3 = new EntryCache(storage);
    expect(await entryCache3.has("foo")).to.be.true;
    expect(await entryCache3.get("foo")).deep.equal(entry("bar", 1));
    expect(await getEntry(executor, "test", "foo")).deep.equal(entry("bar", 1));

    // stacking!
    const entryCache4 = new EntryCache(entryCache3);
    await entryCache4.put("hot", "dog", 2);
    expect(await entryCache4.get("hot")).deep.equal(entry("dog", 2));

    // If we don't flush, it doesn't show up in underlying storage
    expect(await entryCache3.get("hot")).deep.equal(entry(undefined, 0));

    // ... but as soon as we flush, it does.
    await entryCache4.flush();
    expect(await entryCache3.get("hot")).deep.equal(entry("dog", 2));
    expect(await getEntry(executor, "test", "foo")).deep.equal(entry("bar", 1));
  });
});

test("pending", async () => {
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test");
    const entryCache = new EntryCache(storage);
    expect(entryCache.pending()).deep.equal([]);

    entryCache.put("foo", "bar", 1);
    expect(entryCache.pending()).deep.equal([
      {
        op: "put",
        key: "foo",
        value: "bar",
      },
    ]);

    // change the value at a key, should still have one entry in patch
    entryCache.put("foo", "baz", 1);
    expect(entryCache.pending()).deep.equal([
      {
        op: "put",
        key: "foo",
        value: "baz",
      },
    ]);

    // don't change anything, just reset
    entryCache.put("foo", "baz", 1);
    expect(entryCache.pending()).deep.equal([
      {
        op: "put",
        key: "foo",
        value: "baz",
      },
    ]);

    // change only version
    entryCache.put("foo", "qux", 2);
    expect(entryCache.pending()).deep.equal([
      {
        op: "put",
        key: "foo",
        value: "qux",
      },
    ]);

    // change only version
    entryCache.del("foo", 2);
    expect(entryCache.pending()).deep.equal([
      {
        op: "del",
        key: "foo",
      },
    ]);

    // change only version
    entryCache.put("hot", "dog", 2);
    expect(entryCache.pending()).deep.equal([
      {
        op: "del",
        key: "foo",
      },
      {
        op: "put",
        key: "hot",
        value: "dog",
      },
    ]);
  });
});
