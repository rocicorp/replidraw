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
        pushMaxConnections: 1,
      });

      const superPokes: Map<string, PullResponse> = new Map();
      // let lastCookie: string | undefined;
      // let lastPullResponse: PullResponse | undefined;
      const defaultPuller = rep.puller;

      rep.puller = async (request: Request): Promise<PullerResult> => {
        // console.log(
        //   "xxx super poke last data. lastCookie",
        //   lastCookie,
        //   "lastPullResponse",
        //   lastPullResponse
        // );
        // console.log(
        //   "xxx puller request: request.cookie",
        //   (await request.clone().json()).cookie,
        //   "lastCookie",
        //   lastCookie
        // );

        const requestCookie = (await request.clone().json()).cookie;

        // console.log("xxx looking for cookie", requestCookie);
        // console.log("xxx have", [...superPokes.keys()]);

        const superPokeResponse = superPokes.get(requestCookie);
        if (superPokeResponse) {
          console.log("xxx found super poke", requestCookie);
          superPokes.delete(requestCookie);
          return {
            response: superPokeResponse,
            httpRequestInfo: { httpStatusCode: 200, errorMessage: "" },
          };
        } else {
          console.log("xxx failed to find super poke for", requestCookie);
          // superPokes.clear();
        }

        // if (
        //   lastPullResponse &&
        //   (await request.clone().json()).cookie === lastCookie
        // ) {
        //   const response = lastPullResponse;
        //   console.log("xxx found a match");
        //   lastCookie = undefined;
        //   lastPullResponse = undefined;
        //   return {
        //     response,
        //     httpRequestInfo: { httpStatusCode: 200, errorMessage: "" },
        //   };
        // }

        console.log(
          "xxx doing defaultPuller with request cookie",
          requestCookie
        );
        const res = await defaultPuller(request);
        console.log("xxx defaultPuller result cookie", res.response?.cookie);
        return res;
      };

      const defaultUserInfo = randUserInfo();
      const d = await createData(rep, defaultUserInfo);
      const { clientID } = d;

      Pusher.logToConsole = true;
      const pusher = new Pusher("d9088b47d2371d532c4c", {
        cluster: "us3",
        authEndpoint: "/api/pusher-auth",
        auth: {
          params: {
            clientID,
          },
        },
      });

      // Use a presence channel so that we know who is in the room.
      const presenceChannel = pusher.subscribe(`presence-${docID}`);
      presenceChannel.bind("poke", () => {
        // console.log("xxx poke");
        // rep.pull();
      });

      type SuperPoke = {
        lastCookie: string;
        response: PullResponse;
      };

      const personalChannel = pusher.subscribe(`private-${clientID}`);
      personalChannel.bind("super-poke", (data: SuperPoke) => {
        const { lastCookie, response } = data;
        console.log(
          "xxx got super poke with base cookie:",
          lastCookie,
          "response.cookie:",
          response.cookie
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
