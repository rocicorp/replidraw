import type { NextApiRequest, NextApiResponse } from "next";
import { must } from "../../backend/decode";
import { computePull, pullRequestType } from "../../backend/pull";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log(`Processing pull`, JSON.stringify(req.body, null, ""));

  const docID = req.query["docID"].toString();
  const pullReq = must(pullRequestType.decode(req.body));
  const resp = await computePull(
    pullReq.cookie ?? "0",
    pullReq.clientID,
    docID
  );

  console.log(`Returning`, JSON.stringify(resp, null, ""));
  res.json(resp);
  res.end();
};
