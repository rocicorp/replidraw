import { JSONValue, WriteTransaction } from "replicache";
import { usrKey } from "./key";
import {Read} from "./read";

export class Write extends Read implements WriteTransaction {
  private now: number;

  constructor(tx: DurableObjectTransaction, now: number) {
    super(tx);
    this.now = now;
  }

  // TODO: Need to also maintain indexes for computing diffs
  async put(key: string, value: JSONValue): Promise<void> {
    await this.tx.put(usrKey(key), {
      modified: this.now,
      value
    });
  }

  async del(key: string): Promise<boolean> {
    return await this.tx.delete(usrKey(key));
  }
}
