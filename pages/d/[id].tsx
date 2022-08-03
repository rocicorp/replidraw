import { useEffect, useState } from "react";
import { Replicache } from "replicache";
import { Designer } from "../../frontend/designer";
import { Nav } from "../../frontend/nav";
import Pusher from "pusher-js";
import { M, mutators } from "../../frontend/mutators";
import { randUserInfo } from "../../frontend/client-state";
import { randomShape } from "../../frontend/shape";
import { UndoManager } from "@rocicorp/undo";
import { debug } from "console";

export default function Home() {
  const [rep, setRep] = useState<Replicache<M> | null>(null);
  const [undoManager, setUndoManager] = useState<UndoManager | null>(null);
  const [canUndoRedo, setCanUndoRedo] = useState({
    canUndo: false,
    canRedo: false,
  });
  // TODO: Think through Replicache + SSR.
  useEffect(() => {
    (async () => {
      if (rep) {
        return;
      }

      const [, , docID] = location.pathname.split("/");
      const r = new Replicache({
        // To get your own license key run `npx replicache get-license`. (It's free.)
        licenseKey: process.env.NEXT_PUBLIC_REPLICACHE_LICENSE_KEY!,
        pushURL: `/api/replicache-push?spaceID=${docID}`,
        pullURL: `/api/replicache-pull?spaceID=${docID}`,
        pullInterval: 10000,
        name: docID,
        logLevel: "info",
        mutators,
      });

      const defaultUserInfo = randUserInfo();
      await r.mutate.initClientState({
        id: await r.clientID,
        defaultUserInfo,
      });
      r.onSync = (syncing: boolean) => {
        if (!syncing) {
          r.onSync = null;
          r.mutate.initShapes(Array.from({ length: 5 }, () => randomShape()));
        }
      };

      if (
        process.env.NEXT_PUBLIC_PUSHER_KEY &&
        process.env.NEXT_PUBLIC_PUSHER_CLUSTER
      ) {
        Pusher.logToConsole = true;
        const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
        });

        const channel = pusher.subscribe("default");
        channel.bind("poke", () => {
          r.pull();
        });
      }
      setUndoManager(
        new UndoManager({
          onChange: setCanUndoRedo,
        })
      );
      setRep(r);
    })();
  }, []);

  if (!rep || !undoManager) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        background: "rgb(229,229,229)",
      }}
    >
      <Nav rep={rep} canUndoRedo={canUndoRedo} undoManager={undoManager} />
      <Designer {...{ rep, undoManager }} />
    </div>
  );
}
