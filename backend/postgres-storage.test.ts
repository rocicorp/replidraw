import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { PostgresStorage } from "./postgres-storage";
import { createDatabase, getObject } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("ReplicacheTransaction", async () => {
  await transact(async (executor) => {
    const storage = new PostgresStorage(executor, "test");

    expect(await storage.get("foo")).to.be.undefined;

    await storage.put("foo", "bar");
    expect(await storage.get("foo")).to.equal("bar");

    expect(await getObject(executor, "test", "foo")).equal("bar");
    expect(await getObject(executor, "test2", "foo")).to.be.undefined;

    // Changes are written through immediately to postgres, so when tx commits...
  });

  await transact(async (executor) => {
    // ... they are visible to subsequent transactions.
    const storage = new PostgresStorage(executor, "test");
    expect(await storage.get("foo")).to.equal("bar");
  });
});
