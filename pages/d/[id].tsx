import { useEffect, useState } from "react";
import { Replicache } from "replicache";
import { createData, mutators } from "../../frontend/data";
import { Designer } from "../../frontend/designer";
import { Nav } from "../../frontend/nav";
import Pusher from "pusher-js";

import type { Data } from "../../frontend/data";
import { randUserInfo } from "../../shared/client-state";

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

      const workerURL = (protocol: string, path: string) => {
        return `${protocol}${workerSecureSuffix}://${workerHost}/${path}?room=${room}`;
      }

      const rep = new Replicache({
        pushURL: workerURL('http', 'replicache-push'),
        pullURL: workerURL('http', 'replicache-pull'),
        useMemstore: true,
        mutators,
      });

      const defaultUserInfo = randUserInfo();
      const d = await createData(rep, defaultUserInfo);

      console.log("Connecting to web socket...");
      const ws = new WebSocket(workerURL('ws', 'replicache-poke'));
      ws.addEventListener("open", () => {
        console.log("connected ... yay");
      });
      ws.addEventListener("message", () => {
        console.log("got poked, pulling");
        rep.pull();
      });

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
