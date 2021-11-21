// Our SQL-Level data model.

import { JSONValue } from "replicache";
import { Cookie } from "schemas/poke";
import { Executor, transact } from "./db";
import { ClientID } from "./server";

export async function createDatabase() {
  await transact(async (executor) => {
    // TODO: Proper versioning for schema.
    await executor("drop table if exists client cascade");
    await executor("drop table if exists entry cascade");

    await executor(`create table client (
      id varchar(100) primary key not null,
      basecookie int null,
      lastmutationid int not null,
      roomid varchar(100) not null)`);

    await executor(`create table entry (
      k varchar(100) not null,
      v text not null,
      roomid varchar(100) not null,
      deleted bool not null default false,
      version int not null,
      unique (roomid, k)
      )`);

    await executor(`create index on entry (roomid)`);
    await executor(`create index on entry (deleted)`);
    await executor(`create index on entry (version)`);
  });
}

export type ClientRecord = {
  id: string;
  baseCookie: Cookie;
  lastMutationID: number;
  roomID: string;
};

// We use the term "cookie" when referring to the opaque value that
// goes back and forth to the client. We use "version" when referring
// to the per-room integer that we to calculate diffs and so-on.
export type Version = number;

export async function getRoomVersion(
  executor: Executor,
  roomID: string
): Promise<number> {
  const result = await executor(
    "select max(version) as version from entry where roomid = $1",
    [roomID]
  );
  return result.rows[0]?.version ?? 0;
}

export async function mustGetClientRecord(
  executor: Executor,
  clientID: string
): Promise<ClientRecord> {
  const result = await getClientRecord(executor, clientID);
  if (result === null) {
    throw new Error(`Unknown client: ${clientID}`);
  }
  return result;
}

export async function getClientRecord(
  executor: Executor,
  clientID: string
): Promise<ClientRecord | null> {
  const result = await executor(
    "select basecookie, lastmutationid, roomid from client where id = $1",
    [clientID]
  );
  if (result.rows.length === 0) {
    return null;
  }
  const [row] = result.rows;
  const res = {
    id: clientID,
    baseCookie: row.basecookie,
    lastMutationID: row.lastmutationid,
    roomID: row.roomid,
  };
  console.log("getClientRecord", JSON.stringify(res));
  return res;
}

export async function mustGetClientRecords(
  executor: Executor,
  clientIDs: ClientID[]
): Promise<Map<ClientID, ClientRecord>> {
  const records = await Promise.all(
    clientIDs.map((clientID) => mustGetClientRecord(executor, clientID))
  );
  const entries = records.map(
    (record) => [record.id, record] as [ClientID, ClientRecord]
  );
  return new Map(entries);
}

export async function setClientRecord(
  executor: Executor,
  record: ClientRecord
): Promise<void> {
  console.log("Saving clientRecord", JSON.stringify(record));
  await executor(
    "insert into client (id, basecookie, lastmutationid, roomid) values ($1, $2, $3, $4) " +
      "on conflict (id) do update set basecookie = $2, lastmutationid = $3, roomid = $4",
    [record.id, record.baseCookie, record.lastMutationID, record.roomID]
  );
}

/**
 * Represents an entry in our key/value store. If the value is undefined then
 * the value is logically deleted.
 */
export type Entry = {
  value: JSONValue | undefined;
  version: Version;
};

// TODO: Consider using a tuple type for Entry instead?
export function entry(value: JSONValue | undefined, version: Version) {
  return {
    value,
    version,
  };
}

/**
 * Returns the value and version for some key in the database.
 *
 * Always returns an `Entry`. Caller must check if value === undefined.
 */
export async function getEntry(
  executor: Executor,
  roomID: string,
  key: string
): Promise<Entry> {
  const {
    rows,
  } = await executor(
    "select v, deleted, version from entry where roomid = $1 and k = $2",
    [roomID, key]
  );
  const [row] = rows;
  if (!row) {
    return { value: undefined, version: 0 };
  }
  const { v, deleted, version } = row;
  return {
    value: deleted ? undefined : JSON.parse(v),
    version,
  };
}

export async function putEntry(
  executor: Executor,
  roomID: string,
  key: string,
  value: JSONValue,
  version: Version
): Promise<void> {
  await executor(
    `
    insert into entry (roomid, k, v, deleted, version)
    values ($1, $2, $3, false, $4)
      on conflict (roomid, k) do update set v = $3, deleted = false, version = $4
    `,
    [roomID, key, JSON.stringify(value), version]
  );
}

export async function delEntry(
  executor: Executor,
  roomID: string,
  key: string,
  version: number
): Promise<void> {
  await executor(
    `
    update entry set deleted = true, version = $3
    where roomid = $1 and k = $2
  `,
    [roomID, key, version]
  );
}
