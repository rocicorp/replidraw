import { useEffect, useState } from "react";
import { HTTPRequestInfo, PullerResult, Replicache } from "replicache";
import { Designer } from "../../frontend/designer";
import { Nav } from "../../frontend/nav";
import { M, mutators } from "../../frontend/mutators";
import { randUserInfo } from "../../frontend/client-state";
import { randomShape } from "../../frontend/shape";
import { Request, responseSchema } from "schemas/socket";
import { PushRequest, PushResponse } from "schemas/push";
import { PullRequest, PullResponse } from "schemas/pull";
import { resolver } from "frontend/resolver";
import { nanoid } from "nanoid";

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

        // These pusher and puller implementations are a bit hacky for the moment.
        // Even though the core replicache protocol is very asynchronous and doesn't
        // care about replies, there are two exceptions:
        //
        // - The connection loop wants to know when a response is done so that it can
        //   do exponential backoff.
        // - The puller needs to know the response to pull because it needs to enforce
        //   that pulls are serialized.
        //
        // When we fix both of these things in Replicache, this will get a lot simpler
        // because the responses will go away.

        pusher: async (req) => {
          const ws = await socket;
          const pushReq = (await req.json()) as PushRequest;
          pushReq.id = nanoid();
          const msg: Request = ["pushReq", pushReq];

          const { promise, resolve } = resolver<HTTPRequestInfo>();
          const listener = (e: MessageEvent) => {
            const data = JSON.parse(e.data);
            const [type, res] = responseSchema.parse(data);
            if (type == "pushRes") {
              const pushRes = res as PushResponse;
              if (pushRes.id == pushReq.id) {
                ws.removeEventListener("message", listener);
                resolve({
                  errorMessage: "",
                  httpStatusCode: 200,
                });
              }
            }
          };

          ws.addEventListener("message", listener);
          ws.send(JSON.stringify(msg));
          return await promise;
        },

        puller: async (req) => {
          const ws = await socket;
          const pullReq = (await req.json()) as PullRequest;
          const msg: Request = ["pullReq", pullReq];

          const { promise, resolve } = resolver<PullerResult>();
          const listener = (e: MessageEvent) => {
            const data = JSON.parse(e.data);
            const [type, res] = responseSchema.parse(data);
            if (type == "pullRes") {
              const pullRes = res as PullResponse;
              if (pullRes.baseCookie == pullReq.cookie) {
                ws.removeEventListener("message", listener);
                resolve({
                  httpRequestInfo: {
                    errorMessage: "",
                    httpStatusCode: 200,
                  },
                  response: pullRes,
                });
              }
            }
          };

          ws.addEventListener("message", listener);
          ws.send(JSON.stringify(msg));

          return await promise;
        },
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
        ws.addEventListener("message", (e) => {
          const data = JSON.parse(e.data);
          const [type] = responseSchema.parse(data);
          if (type == "pokeRes") {
            r.pull();
          }
        });
        return await promise;
      })();

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
