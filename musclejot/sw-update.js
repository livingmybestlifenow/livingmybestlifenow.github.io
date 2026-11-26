/* Claim the page immediately and reload windows that were already open on the live site. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      await self.clients.claim()
      for (const client of clients) {
        let url
        try {
          url = new URL(client.url)
        } catch {
          continue
        }
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') continue
        if (!url.pathname.startsWith('/musclejot')) continue
        try {
          await client.navigate(client.url)
        } catch {
          /* the page script reloads on controllerchange */
        }
      }
    })(),
  )
})
