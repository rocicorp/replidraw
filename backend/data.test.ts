import { expect } from "chai";
import { setup, test } from "mocha";
import {
  createDatabase,
  delObject,
  getCookie,
  getLastMutationID,
  getObject,
  putObject,
  setLastMutationID,
} from "./data";
import { withExecutor } from "./pg";

setup(async () => {
  await withExecutor(async () => {
    console.log("create database");
    await createDatabase();
  });
});

test("put/get/del", async () => {
  await withExecutor(async (executor) => {
    expect(await getObject(executor, "doc1", "foo")).to.be.undefined;

    await putObject(executor, "doc1", "foo", "bar");
    expect(await getObject(executor, "doc1", "foo")).to.equal("bar");

    await putObject(executor, "doc1", "foo", "baz");
    expect(await getObject(executor, "doc1", "foo")).to.equal("baz");

    await delObject(executor, "doc1", "foo");
    expect(await getObject(executor, "doc1", "foo")).to.be.undefined;
  });
});

test("set/getlastmutationid", async () => {
  await withExecutor(async (executor) => {
    expect(await getLastMutationID(executor, "c1")).to.equal(0);
    await setLastMutationID(executor, "c1", 1);
    expect(await getLastMutationID(executor, "c1")).to.equal(1);
    expect(await getLastMutationID(executor, "c2")).to.equal(0);

    await setLastMutationID(executor, "c1", 2);
    expect(await getLastMutationID(executor, "c1")).to.equal(2);
  });
});

test("getCookie", async () => {
  await withExecutor(async (executor) => {
    expect(await getCookie(executor, "d1")).to.equal("0");
    await putObject(executor, "d1", "foo", "bar");
    const cookie1 = await getCookie(executor, "d1");

    await putObject(executor, "d1", "foo", "baz");
    const cookie2 = await getCookie(executor, "d1");
    expect(parseFloat(cookie2)).to.be.greaterThan(parseFloat(cookie1));

    await delObject(executor, "d1", "foo");
    const cookie3 = await getCookie(executor, "d1");
    expect(parseFloat(cookie3)).to.be.greaterThan(parseFloat(cookie2));
  });
});
