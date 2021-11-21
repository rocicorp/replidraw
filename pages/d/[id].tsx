import { useEffect, useState } from "react";
import { Replicache } from "replicache";
import { Designer } from "../../frontend/designer";
import { Nav } from "../../frontend/nav";
import { M, mutators } from "../../frontend/mutators";
import { randUserInfo } from "../../frontend/client-state";
import { randomShape } from "../../frontend/shape";
import { Request, responseSchema } from "schemas/network";
import { PushRequest } from "schemas/push";
import { resolver } from "frontend/resolver";
import { PokeResponse } from "schemas/poke";

export default function Home() {
  const [rep, setRep] = useState<Replicache<M> | null>(null);

  // TODO: Replicache + SSR could be cool!
  useEffect(() => {
    (async () => {
      if (rep) {
        return;
      }

      const [, , roomID] = location.pathname.split("/");
      const r = new Replicache({
        useMemstore: true,
        name: roomID,
        mutators,

        pusher: async (req) => {
          const ws = await socket;
          const push = (await req.json()) as PushRequest;
          const msg: Request = ["push", push];
          ws.send(JSON.stringify(msg));
          return {
            errorMessage: "",
            httpStatusCode: 200,
          };
        },

        requestOptions: {
          minDelayMs: 16,
        },

        // No puller: unneeded with poke
        // We should remove from Replicache?
      });

      const socket = (async () => {
        const url = new URL(location.href);
        url.protocol = url.protocol.replace("http", "ws");
        url.searchParams.set("clientID", await r.clientID);
        const ws = new WebSocket(url.toString());
        const { promise, resolve } = resolver<WebSocket>();
        ws.addEventListener("open", () => {
          resolve(ws);
        });

        let gotFirstMessage = false;
        ws.addEventListener("message", async (e) => {
          const data = JSON.parse(e.data);
          const [type, res] = responseSchema.parse(data);
          if (type == "poke") {
            const pr = res as PokeResponse;
            await r.poke({
              baseCookie: pr.baseCookie,
              pullResponse: {
                lastMutationID: pr.lastMutationID,
                cookie: pr.cookie,
                patch: pr.patch,
              },
            });
            if (!gotFirstMessage) {
              gotFirstMessage = true;
              r.mutate.initShapes(
                Array.from({ length: 5 }, () => randomShape())
              );
            }
          }
        });
        return await promise;
      })();

      const defaultUserInfo = randUserInfo();
      await r.mutate.initClientState({
        id: await r.clientID,
        defaultUserInfo,
      });

      setRep(r);
    })();
  }, []);

  if (!rep) {
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
      <Nav rep={rep} />
      <Designer {...{ rep }} />
    </div>
  );
}
