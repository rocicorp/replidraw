# Replidraw

A tiny Figma-like multiplayer graphics editor.

Built with [Replicache](https://replicache.dev), [Next.js](https://nextjs.org/),
[Pusher](https://pusher.com/), and [Postgres](https://mysql.com/).

Running live at https://replidraw.herokuapp.com/.

# Prerequisites

* **Replicache License Key:** Get one at https://doc.replicache.dev/licensing.
* **PostgreSQL:** For MacOS, run `brew install postgres`. For other platforms, see https://www.postgresql.org/download/.
* **A Pusher account:** Sign up for a free account at [pusher.com](https://pusher.com).

# To run locally

```
# Create a new database for Replidraw
psql -d postgres -c 'create database replidraw'

export NEXT_PUBLIC_REPLICACHE_LICENSE_KEY="<your license key>"
export PGDATABASE="replidraw"
export NEXT_PUBLIC_PUSHER_APP_ID=<appid>
export NEXT_PUBLIC_PUSHER_KEY=<pusherkey>
export NEXT_PUBLIC_PUSHER_SECRET=<pushersecret>
export NEXT_PUBLIC_PUSHER_CLUSTER=<pushercluster>

npm run dev
```
