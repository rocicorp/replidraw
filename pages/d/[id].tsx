import { useEffect, useState } from "react";
import { PullerResult, ReadonlyJSONObject, ReadonlyJSONValue, Replicache } from "replicache";
import { createData, mutators } from "../../src/data";
import { Designer } from "../../src/designer";
import { Nav } from "../../src/nav";

import type { Data } from "../../src/data";
import { randUserInfo } from "../../src/client-state";

export default function Home() {
  const [data, setData] = useState<Data | null>(null);

  // TODO: Think through Replicache + SSR.
  useEffect(() => {
    (async () => {
      if (data) {
        return;
      }

      const url = new URL(location.href);
      const [, , room] = url.pathname.split("/");
      const wantsProd = url.searchParams.get("prod-worker");
      const isProd = (wantsProd !== null && (wantsProd === "1" || wantsProd.toLowerCase() === "true")) ||
        url.host.indexOf(".vercel.app") > -1;
      const workerHost = isProd
        ? `replicache-worker.replicache.workers.dev`
        : `127.0.0.1:8787`;
      const workerSecureSuffix = isProd ? "s" : "";

      const workerURL = (protocol: string, path: string, qs = new URLSearchParams()) => {
        qs.set("room", room);
        return `${protocol}${workerSecureSuffix}://${workerHost}/${path}?${qs.toString()}`;
      }

      const rep = new Replicache({
        pushURL: workerURL('http', 'replicache-push'),
        useMemstore: true,
        requestOptions: {
          experimentalMaxConcurrentRequests: 100,
        },
        puller: async (req: Request) => {
          const reqJSON = await req.json();
          const nullResponse: PullerResult = {
            httpRequestInfo: {
              httpStatusCode: 200,
              errorMessage: '',
            },
            response: {
              lastMutationID: reqJSON.lastMutationID,
              patch: [],
              cookie: reqJSON.cookie,
            }
          };

          const res = await fetch(workerURL('http', 'replicache-pull'), {
            method: 'POST',
            body: JSON.stringify(reqJSON),
          });
          const resJSON = await res.json();

          // then immediately use the apply interface to apply the real response
          queueMicrotask(() => {
            rep.experimentalApplyPullResponse(reqJSON.cookie, resJSON);
          });
          return nullResponse;
        },
        mutators,
      });

      const defaultUserInfo = randUserInfo();
      const d = await createData(rep, defaultUserInfo);

      let ws: WebSocket;

      const initSocket = async () => {
        if (ws !== undefined && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          return;
        }
        console.debug("Connecting WebSocket...");
        const clientID = await rep.clientID;
        ws = new WebSocket(workerURL('ws', `replicache-poke`, new URLSearchParams([["clientID", clientID]])));
        ws.onopen = () => {
          console.log("Connected to WebSocket");
          rep.pull();
        };
        ws.onmessage = () => {
          console.debug('Received poke, pulling');
          rep.pull();
        };
        ws.onerror = (e) => {
          console.error("Error from WebSocket", e);
        };
        ws.onclose = () => {
          console.log("Disconnected from WebSocket. Will reconnect on next interaction");
        };
      };
      initSocket();

      // TODO: This is a hack to make sure the socket is connected. Do this properly with
      // addEventListener(), but need to removeEventListener() too and can't do that because
      // this is async, gar.
      window.onfocus = initSocket;
      window.onmousemove = initSocket;
      window.ontouchstart = initSocket;

      setData(d);
    })();
  }, []);

  if (!data) {
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
      <Nav data={data} />
      <Designer {...{ data }} />
    </div>
  );
}
