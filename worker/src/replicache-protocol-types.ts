export type PushRequestBody = {
  clientID: string;
  mutations: Mutation[];
  pushVersion: number;
  schemaVersion: string;
};

export type Mutation = {
  id: number;
  name: string;
  args?: any;  // actually required JSONValue, but circular types not allowed by zod
};
