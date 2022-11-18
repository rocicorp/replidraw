import type {ReadTransaction, WriteTransaction} from 'replicache';
import {z} from 'zod';
import {randInt} from './rand';

const colors = [
  '#f94144',
  '#f3722c',
  '#f8961e',
  '#f9844a',
  '#f9c74f',
  '#90be6d',
  '#43aa8b',
  '#4d908e',
  '#577590',
  '#277da1',
];
const avatars = [
  ['🐶', 'Puppy'],
  ['🐱', 'Kitty'],
  ['🐭', 'Mouse'],
  ['🐹', 'Hamster'],
  ['🐰', 'Bunny'],
  ['🦊', 'Fox'],
  ['🐻', 'Bear'],
  ['🐼', 'Panda'],
  ['🐻‍❄️', 'Polar Bear'],
  ['🐨', 'Koala'],
  ['🐯', 'Tiger'],
  ['🦁', 'Lion'],
  ['🐮', 'Cow'],
  ['🐷', 'Piggy'],
  ['🐵', 'Monkey'],
  ['🐣', 'Chick'],
];

export const userInfoSchema = z.object({
  avatar: z.string(),
  name: z.string(),
  color: z.string(),
});

export const clientStatePrefix = `clientState-`;

export const clientStateKey = (id: string) => `${clientStatePrefix}${id}`;

export const clientStateID = (key: string) => {
  if (!key.startsWith(clientStatePrefix)) {
    throw new Error(`Invalid key: ${key}`);
  }
  return key.substring(clientStatePrefix.length);
};

export const clientStateSchema = z.object({
  id: z.string(),
  cursor: z.object({
    x: z.number(),
    y: z.number(),
  }),
  overID: z.string(),
  selectedID: z.string(),
  userInfo: userInfoSchema,
});

export type UserInfo = z.TypeOf<typeof userInfoSchema>;
export type ClientState = z.TypeOf<typeof clientStateSchema>;

const clientStateValueSchema = clientStateSchema.omit({id: true});

export async function initClientState(
  tx: WriteTransaction,
  {id, defaultUserInfo}: {id: string; defaultUserInfo: UserInfo},
): Promise<void> {
  if (await tx.has(clientStateKey(id))) {
    return;
  }
  await putClientState(tx, {
    id,
    cursor: {
      x: 0,
      y: 0,
    },
    overID: '',
    selectedID: '',
    userInfo: defaultUserInfo,
  });
}

export async function getClientState(
  tx: ReadTransaction,
  id: string,
): Promise<ClientState> {
  const val = await tx.get(clientStateKey(id));
  if (val === undefined) {
    throw new Error('Expected clientState to be initialized already: ' + id);
  }
  return {
    id,
    ...clientStateValueSchema.parse(val),
  };
}

export async function putClientState(
  tx: WriteTransaction,
  clientState: ClientState,
): Promise<void> {
  await tx.put(clientStateKey(clientState.id), clientState);
}

export async function setCursor(
  tx: WriteTransaction,
  {id, x, y}: {id: string; x: number; y: number},
): Promise<void> {
  const clientState = await getClientState(tx, id);
  clientState.cursor.x = x;
  clientState.cursor.y = y;
  await putClientState(tx, clientState);
}

export async function overShape(
  tx: WriteTransaction,
  {clientID, shapeID}: {clientID: string; shapeID: string},
): Promise<void> {
  const clientState = await getClientState(tx, clientID);
  clientState.overID = shapeID;
  await putClientState(tx, clientState);
}

export async function selectShape(
  tx: WriteTransaction,
  {clientID, shapeID}: {clientID: string; shapeID: string},
): Promise<void> {
  const clientState = await getClientState(tx, clientID);
  clientState.selectedID = shapeID;
  await putClientState(tx, clientState);
}

export function randUserInfo(): UserInfo {
  const [avatar, name] = avatars[randInt(0, avatars.length - 1)];
  return {
    avatar,
    name,
    color: colors[randInt(0, colors.length - 1)],
  };
}
