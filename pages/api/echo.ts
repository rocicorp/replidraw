import type {NextApiRequest, NextApiResponse} from 'next';

// Just here to test RTT to Next.js.
// eslint-disable-next-line require-await
export default async (req: NextApiRequest, res: NextApiResponse) => {
  res.send('hello, world');
  res.end();
};
