import { Replicache, ReplicacheOptions } from "replicache";
import { mutators } from "./mutators";

export class Rep extends Replicache<typeof mutators> {
  private _cid = "";
  get cid() {
    return this._cid;
  }
  static async new({ pushURL, pullURL }: { pushURL: string; pullURL: string }) {
    const rep = new Rep({
      pushURL,
      pullURL,
      useMemstore: true,
      requestOptions: {
        experimentalMaxConcurrentRequests: 100,
      },
      mutators,
    });
    // TODO: clientID should be available synchronously in Replicache.
    rep._cid = await rep.clientID;
    return rep;
  }
  private constructor(options: ReplicacheOptions<typeof mutators>) {
    super(options);
  }
}
