import { useEffect, useState } from "react";
import { Replicache } from "replicache";
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

      const ws = new WebSocket(workerURL('ws', 'replicache-poke'));
      ws.addEventListener("open", () => {
        console.log("Connected to WebSocket");
      });
      ws.addEventListener("message", () => {
        console.debug('Received poke, pulling');
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
