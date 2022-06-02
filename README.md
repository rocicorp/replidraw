# Replidraw

A tiny Figma-like multiplayer graphics editor.

Built with [Replicache](https://replicache.dev), [Next.js](https://nextjs.org/),
[Pusher](https://pusher.com/), and [Postgres](https://www.postgresql.org/).

Running live at https://replidraw.herokuapp.com/.

# Prerequisites

1. [Get a Replicache license key](https://doc.replicache.dev/licensing)
2. [Install PostgreSQL](https://www.postgresql.org/download/)
3. [Sign up for a free pusher.com account](https://pusher.com/) and create a new "channels" app.

# To run locally

```
# Create a new database for Replidraw
psql -d postgres -c 'create database replidraw'

export PGDATABASE="replidraw"
export NEXT_PUBLIC_REPLICACHE_LICENSE_KEY="<your license key>"
# Get the following values from the 'app keys' section of the pusher app UI.
export NEXT_PUBLIC_PUSHER_APP_ID=<appid>
export NEXT_PUBLIC_PUSHER_KEY=<pusherkey>
export NEXT_PUBLIC_PUSHER_SECRET=<pushersecret>
export NEXT_PUBLIC_PUSHER_CLUSTER=<pushercluster>

npm install
npm run dev
```
