import { createServer } from "http";
import WebSocket from "ws";
import { parse } from "url";
import next from "next";
import { Socket } from "node:net";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

type Client = {
  clientID: string;
  roomID: string;
  socket: WebSocket;
};

const clients: Client[] = [];

app.prepare().then(() => {
  const server = createServer((req, res) =>
    handle(req, res, parse(req.url!, true))
  );
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", (ws, req) => {
    const url = parse(req.url!, true);
    const parts = (url.pathname ?? "").split("/");

    if (parts[1] != "d" || !parts[2]) {
      ws.send("invalid url - no room id");
      ws.close();
      return;
    }

    const roomID = parts[2];
    const clientID = (url.query.clientID ?? [])[0];
    if (!clientID) {
      ws.send("invalid url - no client ID");
      ws.close();
      return;
    }

    const existingClient = clients.find((c) => c.clientID === clientID);
    if (existingClient) {
      existingClient.socket.close();
    }

    const client = {
      clientID,
      roomID,
      socket: ws,
    };
    clients.push(client);

    client.socket.on("close", () => {
      const index = clients.findIndex((c) => c.clientID === clientID);
      clients.splice(index, 1);
    });

    client.socket.on("message", (data: any) => {
      console.log("message", data);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = parse(req.url, true);
    if (url.pathname !== "/_next/webpack-hmr") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  server.listen(port, () => {
    console.log(
      `> Ready on http://localhost:${port} and ws://localhost:${port}`
    );
  });
});