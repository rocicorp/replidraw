import { transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";
import { DBStorage } from "./db-storage";
import { createDatabase, getEntry } from "./data";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("DBStorage", async () => {
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test", 1);

    expect(await getEntry(executor, "test", "foo")).deep.equal([undefined, 0]);
    expect(await storage.get("foo")).to.be.undefined;

    await storage.put("foo", "bar");

    expect(await getEntry(executor, "test", "foo")).deep.equal(["bar", 1]);
    expect(await storage.get("foo")).to.equal("bar");
  });

  // When transaction commits, they are durably in database.
  await transact(async (executor) => {
    const storage = new DBStorage(executor, "test", 2);
    expect(await storage.get("foo")).to.equal("bar");
  });
});
