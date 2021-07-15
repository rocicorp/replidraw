import type { NextApiRequest, NextApiResponse } from "next";
import { createPusher } from "../../backend/pusher";

const pusher = createPusher();

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  const clientID = req.body.clientID;
  const presenceData = {
    user_id: clientID,
  };
  const auth = pusher.authenticate(socketId, channel, presenceData);
  res.send(auth);
};
