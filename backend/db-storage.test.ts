import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { DBStorage } from "./db-storage";
import { createDatabase, entry, getEntry } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("DBStorage", async () => {
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test");

    expect(await getEntry(executor, "test", "foo")).deep.equal(
      entry(undefined, 0)
    );
    expect(await storage.get("foo")).deep.equal(entry(undefined, 0));

    await storage.put("foo", "bar", 42);

    expect(await getEntry(executor, "test", "foo")).deep.equal(
      entry("bar", 42)
    );
    expect(await storage.get("foo")).deep.equal(entry("bar", 42));
  });

  // When transaction commits, they are durably in database.
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test");
    expect(await storage.get("foo")).deep.equal(entry("bar", 42));
  });
});
