import { Patch, Cookie } from "schemas/poke";
import { Executor } from "./db";

export async function getPatch(
  executor: Executor,
  roomID: string,
  fromCookie: Cookie
): Promise<Patch> {
  const t0 = Date.now();
  const entries = await executor(
    `select k, v, deleted from entry where roomid = $1 and version > $2`,
    [roomID, fromCookie ?? 0]
  );
  console.log(`Read ${entries.rows.length} entries in`, Date.now() - t0);

  const patch: Patch = [];
  for (let row of entries.rows) {
    const { k, v, deleted } = row;
    if (deleted) {
      patch.push({
        op: "del",
        key: k,
      });
    } else {
      patch.push({
        op: "put",
        key: k,
        value: JSON.parse(v),
      });
    }
  }
  return patch;
}

export async function getPatches(
  executor: Executor,
  roomID: string,
  fromCookies: Set<Cookie>
): Promise<Map<Cookie, Patch>> {
  // Calculate all distinct patches in parallel.
  return new Map(
    await Promise.all(
      [...fromCookies].map(
        async (baseCookie) =>
          [baseCookie, await getPatch(executor, roomID, baseCookie)] as [
            Cookie,
            Patch
          ]
      )
    )
  );
}
