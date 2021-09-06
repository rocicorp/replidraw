// In order for the workers runtime to find the class that implements
// our Durable Object namespace, we must export it from the root module.
export { DurableReplicache } from './durable-replicache';

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handleRequest(request, env)
    } catch (e) {
      return new Response(e.message)
    }
  },
}

async function handleRequest(request: Request, env: Env) {
  let id = env.DurableReplicache.idFromName('A')
  let obj = env.DurableReplicache.get(id)
  return await obj.fetch(request)
}

interface Env {
  DurableReplicache: DurableObjectNamespace
}
