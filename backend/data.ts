import { JSONValue, ReadonlyJSONValue } from "replicache";
import { z } from "zod";
import { Executor } from "./pg";

export async function createDatabase(executor: Executor) {
  const schemaVersion = await getSchemaVersion(executor);
  if (schemaVersion < 0 || schemaVersion > 1) {
    throw new Error("Unexpected schema version: " + schemaVersion);
  }
  if (schemaVersion === 0) {
    await createSchemaVersion1(executor);
  }
  console.log("schemaVersion is 1 - nothing to do");
}

async function getSchemaVersion(executor: Executor) {
  const metaExists = await executor(`select exists(
    select from pg_tables where schemaname = 'public' and tablename = 'meta')`);
  if (!metaExists.rows[0].exists) {
    return 0;
  }

  const qr = await executor(
    `select value from meta where key = 'schemaVersion'`
  );
  return qr.rows[0].value;
}

export async function createSchemaVersion1(executor: Executor) {
  await executor("create table meta (key text primary key, value json)");
  await executor("insert into meta (key, value) values ('schemaVersion', '1')");

  await executor(`create table space (
      id text primary key not null,
      version integer not null,
      lastmodified timestamp(6) not null
      )`);

  await executor(`create table client (
        id text primary key not null,
        lastmutationid integer not null,
        lastmodified timestamp(6) not null
        )`);

  await executor(`create table entry (
      spaceid text not null,
      key text not null,
      value text not null,
      deleted boolean not null,
      version integer not null,
      lastmodified timestamp(6) not null
      )`);

  await executor(`create unique index on entry (spaceid, key)`);
  await executor(`create index on entry (spaceid)`);
  await executor(`create index on entry (deleted)`);
  await executor(`create index on entry (version)`);
}

export async function getEntry(
  executor: Executor,
  spaceid: string,
  key: string
): Promise<ReadonlyJSONValue | undefined> {
  const {
    rows,
  } = await executor(
    "select value from entry where spaceid = $1 and key = $2 and deleted = false",
    [spaceid, key]
  );
  const value = rows[0]?.value;
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(value);
}

export async function putEntry(
  executor: Executor,
  spaceID: string,
  key: string,
  value: ReadonlyJSONValue,
  version: number
): Promise<void> {
  await executor(
    `
    insert into entry (spaceid, key, value, deleted, version, lastmodified)
    values ($1, $2, $3, false, $4, now())
      on conflict (spaceid, key) do update set
        value = $3, deleted = false, version = $4, lastmodified = now()
    `,
    [spaceID, key, JSON.stringify(value), version]
  );
}

export async function delEntry(
  executor: Executor,
  spaceID: string,
  key: string,
  version: number
): Promise<void> {
  await executor(
    `update entry set deleted = true, version = $3 where spaceid = $1 and key = $2`,
    [spaceID, key, version]
  );
}

export async function* getEntries(
  executor: Executor,
  spaceID: string,
  fromKey: string
): AsyncIterable<readonly [string, ReadonlyJSONValue]> {
  const {
    rows,
  } = await executor(
    `select key, value from entry where spaceid = $1 and key >= $2 and deleted = false order by key`,
    [spaceID, fromKey]
  );
  for (const row of rows) {
    yield [
      row.key as string,
      JSON.parse(row.value) as ReadonlyJSONValue,
    ] as const;
  }
}

export async function getChangedEntries(
  executor: Executor,
  spaceID: string,
  prevVersion: number
  // TODO(arv): Change this to ReadonlyJSONValue
): Promise<[key: string, value: JSONValue, deleted: boolean][]> {
  const {
    rows,
  } = await executor(
    `select key, value, deleted from entry where spaceid = $1 and version > $2`,
    [spaceID, prevVersion]
  );
  return rows.map((row) => [row.key, JSON.parse(row.value), row.deleted]);
}

export async function getCookie(
  executor: Executor,
  spaceID: string
): Promise<number | undefined> {
  const { rows } = await executor(`select version from space where id = $1`, [
    spaceID,
  ]);
  const value = rows[0]?.version;
  if (value === undefined) {
    return undefined;
  }
  return z.number().parse(value);
}

export async function setCookie(
  executor: Executor,
  spaceID: string,
  version: number
): Promise<void> {
  await executor(
    `
    insert into space (id, version, lastmodified) values ($1, $2, now())
      on conflict (id) do update set version = $2, lastmodified = now()
    `,
    [spaceID, version]
  );
}

export async function getLastMutationID(
  executor: Executor,
  clientID: string
): Promise<number | undefined> {
  const {
    rows,
  } = await executor(`select lastmutationid from client where id = $1`, [
    clientID,
  ]);
  const value = rows[0]?.lastmutationid;
  if (value === undefined) {
    return undefined;
  }
  return z.number().parse(value);
}

export async function setLastMutationID(
  executor: Executor,
  clientID: string,
  lastMutationID: number
): Promise<void> {
  await executor(
    `
    insert into client (id, lastmutationid, lastmodified)
    values ($1, $2, now())
      on conflict (id) do update set lastmutationid = $2, lastmodified = now()
    `,
    [clientID, lastMutationID]
  );
}
