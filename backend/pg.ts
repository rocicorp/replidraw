// Low-level config and utilities for Postgres.

import { Pool, QueryResult } from "pg";

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : undefined
);

// the pool will emit an error on behalf of any idle clients
// it contains if a backend error or network partition happens
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

pool.on("connect", (client) => {
  client.query(
    "SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE"
  );
});

export async function withExecutor<R>(
  f: (executor: Executor) => R
): Promise<R> {
  const client = await pool.connect();

  const executor = async (sql: string, params?: any[]) => {
    try {
      return await client.query(sql, params);
    } catch (e) {
      throw new Error(
        `Error executing SQL: ${sql}: ${((e as unknown) as any).toString()}`
      );
    }
  };

  try {
    return await f(executor);
  } finally {
    client.release();
  }
}

export type Executor = (sql: string, params?: any[]) => Promise<QueryResult>;
export type TransactionBodyFn<R> = (executor: Executor) => Promise<R>;

/**
 * Invokes a supplied function within an RDS transaction.
 * @param body Function to invoke. If this throws, the transaction will be rolled
 * back. The thrown error will be re-thrown.
 */
export async function transact<R>(body: TransactionBodyFn<R>) {
  return await withExecutor(async (executor) => {
    return await transactWithExecutor(executor, body);
  });
}

async function transactWithExecutor<R>(
  executor: Executor,
  body: TransactionBodyFn<R>
) {
  for (let i = 0; i < 10; i++) {
    try {
      await executor("begin");
      try {
        const r = await body(executor);
        await executor("commit");
        return r;
      } catch (e) {
        await executor("rollback");
        throw e;
      }
    } catch (e) {
      if (shouldRetryTransaction(e)) {
        console.log(
          `Retrying transaction due to error ${e} - attempt number ${i}`
        );
        continue;
      }
      throw new Error(
        `Error executing SQL: ${((e as unknown) as any).toString()}`
      );
    }
  }
  throw new Error("Tried to execute transacation too many times. Giving up.");
}

export async function createDatabase() {
  await transact(async (executor) => {
    // TODO: Proper versioning for schema.
    await executor("drop table if exists client cascade");
    await executor("drop table if exists object cascade");

    await executor(`create table client (
      id varchar(100) primary key not null,
      lastmutationid int not null)`);

    await executor(`create table object (
      k varchar(100) not null,
      v text not null,
      documentid varchar(100) not null,
      deleted bool not null default false,
      lastmodified timestamp(6) not null,
      unique (documentid, k)
      )`);

    await executor(`create index on object (documentid)`);
    await executor(`create index on object (deleted)`);
    await executor(`create index on object (lastmodified)`);
  });
}

//stackoverflow.com/questions/60339223/node-js-transaction-coflicts-in-postgresql-optimistic-concurrency-control-and
function shouldRetryTransaction(err: unknown) {
  const code = typeof err === "object" ? String((err as any).code) : null;
  return code === "40001" || code === "40P01";
}
