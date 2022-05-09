# Replidraw

A tiny Figma-like multiplayer graphics editor.

Built with [Replicache](https://replicache.dev), [Next.js](https://nextjs.org/),
[Pusher](https://pusher.com/), and [Postgres](https://mysql.com/).

Running live at https://replidraw.herokuapp.com/.

# To run locally

```
# Get a Replicache license key.
npx replicache get-license

# Install supabase cli, if you don't already have it.
# For MacOS:
brew install supabase/tap/supabase
# For other platforms, see:
# https://github.com/supabase/cli#getting-started

# Initialize supabase.
supabase init

# Docker is required for supabase, if you need it see:
# https://docs.docker.com/engine/install/

# Start supabase. If you are already running supabase for another
# application, first run `supabase stop` before running the
# following command so it will output the config values.
supabase start

# Use license key printed out by `npx replicache get-license`.
export NEXT_PUBLIC_REPLICACHE_LICENSE_KEY="<license key>"
# Use URLs and keys printed out by `supabase start`.
export DATABASE_URL="<DB URL>"

npm run dev
```
