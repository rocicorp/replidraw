// In order for the workers runtime to find the class that implements
// our Durable Object namespace, we must export it from the root module.
export { DurableReplicache } from './durable-replicache';

export default {
  async fetch(request: Request, env: Env) {
    try {
      if (request.method == 'OPTIONS') {
        return new Response(null, {
          headers: {
              'Access-Control-Allow-Origin':  '*',
              'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
              'Access-Control-Allow-Headers': '*',
          },
        })
      }
      return await handleRequest(request, env)
    } catch (e) {
      return new Response(e.message)
    }
  },
}

async function handleRequest(request: Request, env: Env) {
  let id = env.DurableReplicache.idFromName('A')
  let obj = env.DurableReplicache.get(id)
  const response = await obj.fetch(request)
  const corsResponse = new Response(response.body, response)
  corsResponse.headers.set('Access-Control-Allow-Origin', '*')
  return corsResponse
}

interface Env {
  DurableReplicache: DurableObjectNamespace
}
