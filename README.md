# WALL-E Journal

A small GitHub Pages journal editor backed by a Cloudflare Worker. It keeps the
shared password and GitHub token on the Worker, not in the public frontend.

## Frontend

Set `API_URL` at the top of [app.js](app.js) to the deployed Worker URL. The
frontend supports:

- Fetching and parsing the existing `JOURNAL.md`
- Alternating writer/day slots for `Nadoooor` and `ZIZO932`
- Saving one entry without overwriting the other writer's work
- Raw Markdown and rendered preview views
- Markdown download and clipboard copy
- Uploading images into `Images/Journal`

## Cloudflare Worker

Deploy [worker/worker.js](worker/worker.js) as a Cloudflare Worker. The
configuration template is in [worker/wrangler.toml](worker/wrangler.toml).

Set these plain Worker variables:

- `GITHUB_OWNER`: the repository owner or organization
- `GITHUB_REPO`: the repository name
- `JOURNAL_PATH`: exact path and casing, normally `JOURNAL.md`

These must be set in the deployed Worker dashboard. The placeholder values in
`worker/wrangler.toml` are only a template and will not identify your repo.
For example, if the file URL is
`https://github.com/my-org/my-repo/blob/main/JOURNAL.md`, use:

- `GITHUB_OWNER`: `my-org`
- `GITHUB_REPO`: `my-repo`
- `JOURNAL_PATH`: `JOURNAL.md`

A GitHub `404` from `/api/journal` means GitHub cannot see that exact
`owner/repository/path` combination. Verify the file exists on the branch used
by the repository, check uppercase/lowercase spelling, and confirm the token's
repository access and Contents read permission. After changing dashboard
variables, deploy the Worker again.

Add these as Worker secrets. Never commit their values:

- `JOURNAL_PASSWORD`: the shared login password
- `GITHUB_TOKEN`: a GitHub token with Contents read/write access only to this repository
- `SESSION_SECRET`: a long random signing secret

The GitHub token must have access to the organization repository if the journal
is owned by an organization. The organization may need to approve the token.

## GitHub Pages

Publish the repository root as GitHub Pages because `index.html`, `style.css`,
and `app.js` are in the root. After deploying the Worker, update `API_URL`,
commit the frontend, and reload the Pages site.

## Security notes

Rotate any password or token that has been pasted into a chat, screenshot, or
public repository. The Worker issues a one-day signed session token after
login, and journal/image requests require that token.