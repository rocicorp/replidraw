import { WriteTransactionImpl } from "./write-transaction-impl";
import { createDatabase, transact, withExecutor } from "./db";
import { expect } from "chai";
import { setup, test } from "mocha";

setup(async () => {
  await withExecutor(async (executor) => {
    await createDatabase();
  });
});

test("WriteTransactionImpl", async () => {
  await transact(async (tx) => {
    const writeTx = new WriteTransactionImpl(tx, "c1", "foo");

    expect(await writeTx.has("foo")).to.be.false;
    expect(await writeTx.get("foo")).to.be.undefined;

    await writeTx.put("foo", "bar");
    expect(await writeTx.has("foo")).to.be.true;
    expect(await writeTx.get("foo")).to.equal("bar");

    // They don't overlap until one flushes and the other is reloaded.
    const writeTx2 = new WriteTransactionImpl(tx, "c1", "foo");
    expect(await writeTx2.has("foo")).to.be.false;
    expect(await writeTx2.get("foo")).to.be.undefined;

    // TODO: scan, isEmpty

    // Go ahead and flush one
    await writeTx.flush();
    const writeTx3 = new WriteTransactionImpl(tx, "c1", "foo");
    expect(await writeTx3.has("foo")).to.be.true;
    expect(await writeTx3.get("foo")).to.equal("bar");
  });
});
