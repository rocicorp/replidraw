import { createServer } from "http";
import WebSocket from "ws";
import { parse } from "url";
import next from "next";
import { Command } from "commander";
import { connect } from "./connect";
import { Mutation } from "schemas/push";
import { Loop, step } from "./loop";
import { mutators } from "../frontend/mutators";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const program = new Command().option(
  "-p, --port <port>",
  "port to listen on",
  parseInt
);

export type ClientID = string;

export interface Socket {
  send(data: string): void;
  close(): void;
}

// In general, we keep all state in the database, but there is some per-client in-memory state we must maintain:
// 1. The socket connection for the client, duh.
// 2. The roomID associated with the client. We need this because we don't want to have to do a db tx to process a push.
//    However, the roomID here is only a cache of the value in the DB. Also, the roomID per-client never changes in this
//    backend impl.
// 3. The pending mutations for each client.
export type Client = {
  clientID: ClientID;
  roomID: string;
  socket: Socket;
  pending: Mutation[];
};

export type ClientMap = Map<ClientID, Client>;
export const clients: ClientMap = new Map();

app.prepare().then(() => {
  program.parse(process.argv);

  const port = program.opts().port || process.env.PORT || 3000;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const loop = new Loop(
    async () => await step(clients, mutators, performance.now()),
    performance.now,
    sleep,
    50
  );

  const server = createServer((req, res) =>
    handle(req, res, parse(req.url!, true))
  );

  const wss = new WebSocket.Server({ noServer: true });
  wss.on("connection", async (ws, req) => {
    await connect(ws, req, clients, loop);
  });

  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
