import { expect } from "chai";
import { setup, test } from "mocha";
import {
  createDatabase,
  delObject,
  getCookie,
  getClientRecord,
  getObject,
  putObject,
  setClientRecord,
  ClientRecord,
  mustGetClientRecord,
  mustGetClientRecords,
} from "./data";
import { withExecutor } from "./db";
import { ClientID } from "./server";

setup(async () => {
  await withExecutor(async () => {
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

test("set/getClientRecord", async () => {
  await withExecutor(async (executor) => {
    let err = "";
    try {
      await mustGetClientRecord(executor, "c1");
    } catch (e) {
      err = String(e);
    }
    expect(err).equals("Error: Unknown client: c1");
    expect(await getClientRecord(executor, "c1")).to.be.null;

    const expected: ClientRecord = {
      id: "c1",
      baseCookie: 42,
      lastMutationID: 7,
      documentID: "d1",
    };
    await setClientRecord(executor, expected);
    expect(await getClientRecord(executor, "c1")).to.deep.equal(expected);

    expected.baseCookie = 43;
    expected.lastMutationID = 8;
    await setClientRecord(executor, expected);
    expect(await getClientRecord(executor, "c1")).to.deep.equal(expected);
  });
});

test("mustGetClientRecords", async () => {
  await withExecutor(async (executor) => {
    const expected: ClientRecord[] = [
      {
        id: "c1",
        baseCookie: 42,
        lastMutationID: 7,
        documentID: "d1",
      },
      {
        id: "c2",
        baseCookie: 43,
        lastMutationID: 8,
        documentID: "d2",
      },
    ];
    for (const cr of expected) {
      await setClientRecord(executor, cr);
    }
    expect(await mustGetClientRecords(executor, ["c1", "c2"])).to.deep.equal(
      new Map(expected.map((cr) => [cr.id, cr] as [ClientID, ClientRecord]))
    );

    var err = "";
    try {
      await mustGetClientRecords(executor, ["c1", "c2", "c3"]);
    } catch (e) {
      err = String(e);
    }

    expect(err).equals("Error: Unknown client: c3");
  });
});

test("getCookie", async () => {
  await withExecutor(async (executor) => {
    const cookie0 = await getCookie(executor, "d1");
    expect(cookie0).equal(0);

    await putObject(executor, "d1", "foo", "bar");
    const cookie1 = await getCookie(executor, "d1");
    // We don't necessarily expect the very next number because putObject() can
    // call nextval('version') twice. In general, we only care that version
    // ticks up, not by how much.
    expect(cookie1).is.greaterThan(cookie0);

    await putObject(executor, "d1", "foo", "baz");
    const cookie2 = await getCookie(executor, "d1");
    expect(cookie2).is.greaterThan(cookie1);

    await delObject(executor, "d1", "foo");
    const cookie3 = await getCookie(executor, "d1");
    expect(cookie3).is.greaterThan(cookie2);

    // Different documents don't affect each others' cookies.
    await putObject(executor, "d2", "foo", "baz");
    const cookie3Also = await getCookie(executor, "d1");
    expect(cookie3Also).equal(cookie3);
  });
});
