# Development

```
npx miniflare --watch
```

For more information on miniflare, see: https://miniflare.dev/.

# Updating Replicache

This repository uses the git subtree feature to vendor Replicache.

It does this because we're using Replicache in a way it's not
intended to be used and thus doesn't export public API for. That's
fine, we can still use it via vendoring it's just on us (this
project) to adapt to changes.

See https://www.atlassian.com/git/tutorials/git-subtree for more
information on `git subtree`.

To update Replicache, run:

```
git subtree pull --prefix src/replicache replicache main --squash
```
