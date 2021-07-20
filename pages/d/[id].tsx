import { useEffect, useState } from "react";
import { Puller, PullerResult, PullResponse, Replicache } from "replicache";
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

      const [, , docID] = location.pathname.split("/");
      const isProd = location.host.indexOf(".vercel.app") > -1;
      const rep = new Replicache({
        pushURL: `/api/replicache-push?docID=${docID}`,
        pullURL: `/api/replicache-pull?docID=${docID}`,
        wasmModule: isProd ? "/replicache.wasm" : "/replicache.dev.wasm",
        useMemstore: true,
        name: docID,
        mutators,
        pushMaxConnections: 3,
      });

      const superPokes: Map<string, PullResponse> = new Map();
      const defaultPuller = rep.puller;

      rep.puller = async (request: Request): Promise<PullerResult> => {
        const requestCookie = (await request.clone().json()).cookie;

        const superPokeResponse = superPokes.get(requestCookie);
        if (superPokeResponse) {
          console.log(
            "%cxxx found super poke",
            "color:green",
            prettyPrintCookie(requestCookie)
          );
          handledSuperPokes.add(requestCookie);
          superPokes.delete(requestCookie);
          return {
            response: superPokeResponse,
            httpRequestInfo: { httpStatusCode: 200, errorMessage: "" },
          };
        } else {
          console.log(
            "%cxxx failed to find super poke for",
            "color:red",
            prettyPrintCookie(requestCookie)
          );
        }

        console.log(
          "xxx doing defaultPuller with request cookie",
          prettyPrintCookie(requestCookie)
        );
        const res = await defaultPuller(request);
        console.log(
          "xxx defaultPuller result cookie",
          prettyPrintCookie(res.response?.cookie)
        );
        return res;
      };

      const defaultUserInfo = randUserInfo();
      const d = await createData(rep, defaultUserInfo);
      const { clientID } = d;

      Pusher.logToConsole = true;
      const pusher = new Pusher("d9088b47d2371d532c4c", {
        cluster: "us3",
      });

      type SuperPoke = {
        lastCookie: string;
        response: PullResponse;
      };

      const channel = pusher.subscribe(`replidraw-${docID}-${clientID}`);
      channel.bind("super-poke", (data: SuperPoke) => {
        const { lastCookie, response } = data;
        if (handledSuperPokes.has(lastCookie)) {
          console.log(
            "xxx got super poke with base cookie:",
            prettyPrintCookie(lastCookie),
            "which has already been handled"
          );
          return;
        }
        console.log(
          "xxx got super poke with base cookie:",
          prettyPrintCookie(lastCookie),
          "response.cookie:",
          prettyPrintCookie(response.cookie)
        );
        superPokes.set(lastCookie, response);
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

let handledSuperPokes = new Set<string>();

let c = 65;

const m = new Map();

function prettyPrintCookie<T>(
  n: T | null | undefined
): string | undefined | null {
  if (n === null) {
    return null;
  }
  if (n === undefined) {
    return undefined;
  }
  const v = m.get(n);
  if (v !== undefined) {
    return v;
  }
  const s = String.fromCharCode(c++);
  m.set(n, s);
  return s;
}
