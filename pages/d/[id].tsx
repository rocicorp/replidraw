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

  // TODO: Think through Replicache + SSR.
  useEffect(() => {
    (async () => {
      if (rep) {
        return;
      }

      let ws: WebSocket | null = null;
      const getSocket = async () => {
        if (!ws) {
          const url = new URL(location.href);
          url.protocol = url.protocol.replace("http", "ws");
          url.searchParams.set("clientID", await r.clientID);
          ws = new WebSocket(url.toString());
          ws.addEventListener("message", (e) => {
            const data = JSON.parse(e.data);
            const [type] = responseSchema.parse(data);
            if (type == "pokeRes") {
              r.pull();
            }
          });
        }
        return ws;
      };

      const [, , docID] = location.pathname.split("/");
      const r = new Replicache({
        // This business with pusher and puller is a little involved right now
        // because have to simulate a response to return to it so that backoff
        // cna work correctly. Need to adjust that.
        pusher: async (req) => {
          const ws = await getSocket();
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
          const ws = await getSocket();
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
        useMemstore: true,
        name: docID,
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
