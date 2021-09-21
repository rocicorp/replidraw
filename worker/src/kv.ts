import { Store, Read, Write, Value } from './replicache/src/kv/store';
import {
  deleteSentinel,
  WriteImplBase,
} from './replicache/src/kv/write-impl-base';
import { RWLock } from './replicache/src/rw-lock';

// Implements the Replicache kv.Store interface in terms of Durable Objects.
// This is nice because theoretically, we get the entire Replicache userland
// API including scan, indexes, etc... for free.
//
// In practice, we can't quite get there yet. See comments in TransactionImpl.
export class StoreImpl implements Store {
  private _state: DurableObjectState;
  private _lock = new RWLock();

  constructor(state: DurableObjectState) {
    this._state = state;
  }

  async withRead<R>(f: (read: Read) => R | Promise<R>): Promise<R> {
    let read;
    try {
      read = await this.read();
      return await f(read);
    } finally {
      read?.release();
    }
  }

  async withWrite<R>(f: (write: Write) => R | Promise<R>): Promise<R> {
    let write;
    try {
      write = await this.write();
      const rv = await f(write);
      await write.commit();
      return rv;
    } finally {
      write?.release();
    }
  }

  async close(): Promise<void> {}

  async read(): Promise<Read> {
    const release = await this._lock.read();
    return new ReadImpl(this._state.storage, release);
  }

  async write(): Promise<Write> {
    const release = await this._lock.write();
    return new WriteImpl(this._state.storage, release);
  }
}

class ReadImpl implements Read {
  private _storage: DurableObjectOperator;
  readonly release: () => void;

  constructor(storage: DurableObjectOperator, release: () => void) {
    this._storage = storage;
    this.release = release;
  }

  async has(key: string): Promise<boolean> {
    return (await this._storage.get(key)) !== undefined;
  }

  async get(key: string): Promise<Value | undefined> {
    return await this._storage.get(key);
  }
}

class WriteImpl extends WriteImplBase {
  private _storage: DurableObjectOperator;

  constructor(storage: DurableObjectOperator, release: () => void) {
    super(new ReadImpl(storage, release));
    this._storage = storage;
  }

  async commit(): Promise<void> {
    await Promise.all(
      [...this._pending].map(async ([k, v]) => {
        if (v === deleteSentinel) {
          await this._storage.delete(k);
        } else {
          await this._storage.put(k, v);
        }
      }),
    );
  }
}
