import { expect } from "chai";
import { setup, test } from "mocha";
import {
  createDatabase,
  delEntry,
  getRoomVersion,
  getClientRecord,
  getEntry,
  putEntry,
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
    expect(await getEntry(executor, "doc1", "foo")).to.deep.equal([
      undefined,
      0,
    ]);

    await putEntry(executor, "doc1", "foo", "bar", 1);
    expect(await getEntry(executor, "doc1", "foo")).to.deep.equal(["bar", 1]);

    await putEntry(executor, "doc1", "foo", "baz", 2);
    expect(await getEntry(executor, "doc1", "foo")).to.deep.equal(["baz", 2]);

    await delEntry(executor, "doc1", "foo", 3);
    expect(await getEntry(executor, "doc1", "foo")).to.deep.equal([
      undefined,
      3,
    ]);
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
      roomID: "d1",
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
        roomID: "d1",
      },
      {
        id: "c2",
        baseCookie: 43,
        lastMutationID: 8,
        roomID: "d2",
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

test("getRoomVersion", async () => {
  await withExecutor(async (executor) => {
    // The default cookie when there's no data in a room is zero.
    expect(await getRoomVersion(executor, "d1")).equal(0);

    // We always return the highest version on any row for the cookie
    await putEntry(executor, "d1", "a", "a", 1);
    expect(await getRoomVersion(executor, "d1")).equal(1);

    await putEntry(executor, "d1", "b", "b", 2);
    expect(await getRoomVersion(executor, "d1")).equal(2);

    // Resetting an existing key also affects getRoomVersion
    await putEntry(executor, "d1", "b", "b", 3);
    expect(await getRoomVersion(executor, "d1")).equal(3);

    // Note: this means resetting a version *down* can have unexpected effects
    // Our code should never do this.
    await putEntry(executor, "d1", "b", "b", 1);
    expect(await getRoomVersion(executor, "d1")).equal(1);

    // delEntry affects version too.
    await delEntry(executor, "d1", "a", 3);
    expect(await getRoomVersion(executor, "d1")).equal(3);

    // Versions are per-room
    await putEntry(executor, "d2", "foo", "bar", 10);
    expect(await getRoomVersion(executor, "d1")).equal(3);
    expect(await getRoomVersion(executor, "d2")).equal(10);
  });
});
