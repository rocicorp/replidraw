import { JSONValue } from "replicache";
import { Executor } from "./pg";

export async function getCookie(
  executor: Executor,
  docID: string
): Promise<string> {
  const result = await executor(
    "select max(extract(epoch from lastmodified)) from object where documentid = $1",
    [docID]
  );
  return result.rows[0]?.[result.fields[0].name] ?? "0";
}

export async function getLastMutationID(
  executor: Executor,
  clientID: string
): Promise<number> {
  const result = await executor(
    "select lastmutationid from client where id = $1",
    [clientID]
  );
  return result.rows[0]?.lastmutationid ?? 0;
}

export async function setLastMutationID(
  executor: Executor,
  clientID: string,
  lastMutationID: number
): Promise<void> {
  await executor(
    "insert into client (id, lastmutationid) values ($1, $2) " +
      "on conflict (id) do update set lastmutationid = $2",
    [clientID, lastMutationID]
  );
}

export async function getObject(
  executor: Executor,
  documentID: string,
  key: string
): Promise<JSONValue | undefined> {
  const {
    rows,
  } = await executor(
    "select v from object where documentid = $1 and k = $2 and deleted = false",
    [documentID, key]
  );
  const value = rows[0]?.v;
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

export async function putObject(
  executor: Executor,
  docID: string,
  key: string,
  value: JSONValue
): Promise<void> {
  await executor(
    `
    insert into object (documentid, k, v, deleted, lastmodified)
    values ($1, $2, $3, false, now())
      on conflict (documentid, k) do update set v = $3, deleted = false, lastmodified = now()
    `,
    [docID, key, JSON.stringify(value)]
  );
}

export async function delObject(
  executor: Executor,
  docID: string,
  key: string
): Promise<void> {
  await executor(
    `
    update object set deleted = true, lastmodified = now()
    where documentid = $1 and k = $2
  `,
    [docID, key]
  );
}
