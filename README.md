# replicache-todo

A super fast todo list built with Replicache, React, Next.js, Vercel, Supabase, and Postgres.

The simplest possible starter sample for Replicache.
Intended for customers to clone and start editing.

## Prerequisites

Install the following before starting:

- Git
- Docker (and ensure the daemon is running)

## Install the Supabase CLI @ v0.24.5

replicache-todo doesn't work with the most recent Supabase CLI. This has been reported to Supabase: https://github.com/supabase/cli/issues/258.

To install the older version that works on Mac via Homebrew:

```bash
# Download the homebrew formula for the correct version
wget https://raw.githubusercontent.com/supabase/homebrew-tap/1e2b48f45e40a2374979ebcd5f227ccb03892de5/supabase.rb
brew install --formula ./supabase.rb
```

## Setup

```bash
git clone https://github.com/rocicorp/replicache-todo
cd replicache-todo
npm install
supabase init
supabase start
```

To run `replicache-todo` app, run the following command but substitute each angle-bracket-wrapped parameter with the corresponding value which was output from `supabase start`.

```bash
DATABASE_URL="<DB URL>" NEXT_PUBLIC_SUPABASE_URL="<API URL>" NEXT_PUBLIC_SUPABASE_KEY="<anon key>" npm run dev
```

## Publishing

- Push this repo to a new github project
- Create a free account on supabase.com, and an empty project
- Create a free account on vercel.com
- Create a new project on vercel, configuring the environment variables using the values from your hosted Supabase project

## TODO

- Use local postgres for unit tests
- Fix completeAllTodos() to use scan when https://github.com/rocicorp/replicache/issues/607 is fixed
- Switch to Superstruct
- Add instructions about provisioning Supabase and working locally
