import { createServer } from "http";
import WebSocket from "ws";
import { parse } from "url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

app.prepare().then(() => {
  const server = createServer((req, res) =>
    handle(req, res, parse(req.url!, true))
  );
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", async function connection(ws) {
    console.log("incoming connection", ws);
    ws.onclose = () => {
      console.log("connection closed", wss.clients.size);
    };
  });

  server.on("upgrade", function (req, socket, head) {
    const { pathname } = parse(req.url, true);
    if (pathname !== "/_next/webpack-hmr") {
      wss.handleUpgrade(req, socket, head, function done(ws) {
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
