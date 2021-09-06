import 'isomorphic-fetch'

test('an example test', () => {
  expect(23).toBe(23)
})

test('make sure test polyfills for fetch api work', () => {
  const url = "http://workers.cloudflare.com/"
  const req = new Request(url)
  expect(req.url).toBe(url)
})
