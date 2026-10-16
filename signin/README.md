# The sign-in service of the control panel

One stateless Cloudflare Worker, worker.js, for the Symphony control panel at
https://openspineconsortium.com/symphony/control/ and the cost page beside it,
https://openspineconsortium.com/symphony/cost.html (the site's
tools/pages/symphony/control/, tools/pages/symphony/cost/ and
assets/js/symphony-panel.js in OpenSpineConsortium/openspineconsortium.github.io).
The pages are static files that call GitHub's API from the person's browser
as that person. Their first way in is "Sign in with GitHub", one press and no
token made by hand, which this service makes possible (the owner, 2026-10-16:
one-click sign-in as the primary option, as opposed to a fine-grained token).
Until the service runs, the button shows but cannot be pressed, a line says
why, and the way in is a fine-grained personal access token pasted into the
page, folded under "Use a fine-grained token instead"; the token stays the
fallback afterwards.

## Why a service at all

GitHub's web sign-in for a GitHub App sends the browser back with a
one-time code, and turning that code into a token takes the App's client
secret, which no page can hold. This Worker holds the secret, as a secret
of the Worker, and does that one exchange on `POST /exchange`: the page
sends the code, the PKCE verifier it made for this sign-in and its own
address, the Worker adds the client id and the secret, asks
`https://github.com/login/oauth/access_token` and hands back only what the
page needs (the token, when it expires, the refresh token and when that
expires). `POST /refresh` renews the token the same way from the refresh
token. `POST /revoke` asks GitHub to revoke a token, which the page does
when the person presses "Forget the token". `GET /` says what the service
is. It keeps nothing: no store, no cookie, no log of its own; it answers
only the site's origin; it never sees a Claude token and never reads a
repository. The owner decided this shape on 2026-10-13: the control panel
is a site page with a small stateless sign-in service acting through the
App's user token (symphony-template's CLAUDE.md), and the Apps' privacy
statement (symphony-start's PRIVACY.md, version 8) says the same to the
people who use it.

What binds a code to the page that asked for it is PKCE, not the Origin
header: the page makes a secret for each sign-in, sends GitHub its hash
with the sign-in request and sends the secret itself with the code, and
GitHub exchanges the code only for the holder of that secret. The Origin
check on top keeps other sites' scripts out, which is all a header a
program can set is good for.

The token GitHub issues is a user-to-server token of SymphonyBoard: it
acts as the signed-in person, within the App's permissions (Contents,
Issues, Pull requests, Checks, Workflows, Metadata) and within the
person's own access, the intersection of the two, and only on the
repositories the App is installed on. Those permissions read the board,
the issues, the workers and the pull requests and write issues, labels and
merges, which is most of the panel; listing Actions runs and starting a
workflow by hand need Actions, which the App does not hold, so the panel
falls back to the check runs on the default branch and says so, and a
person who wants those two from the App's token adds "Actions: read and
write" to the App's permissions (every installation is then asked to
accept the change). A fine-grained token pasted into the page needs none
of that.

## Deploying it, by hand, once

Nothing here deploys itself; the owner does these steps, each on the page
named, and nobody else needs to.

1. The Worker. Open https://dash.cloudflare.com/ and sign in; in the left
   menu press "Workers & Pages", then "Create application" (or "Create"),
   then "Start with Hello World!" (or "Create Worker"); name it
   `symphony-signin` and press "Deploy". Open
   https://github.com/OpenSpineConsortium/symphony-app/blob/main/signin/worker.js
   and press "Copy raw file" (the copy button above the code). On the
   Worker's page press "Edit code", replace everything in the editor with
   what you copied, and press "Deploy". The
   Worker's address is on its page, of the form
   `https://symphony-signin.<account>.workers.dev`; copy it. That address
   is public and takes no password: the secret stays inside, and the
   checks in worker.js are what stands between the address and GitHub.
2. The Worker's logs, off. Cloudflare turns Workers Logs on for every new
   Worker, which would keep one line per sign-in (the request's address,
   path, status and timing, never the body) in the Cloudflare account for
   seven days. On the Worker's page press "Settings", find "Observability"
   (the section with "Workers Logs" and "Invocation logs"), and turn
   Workers Logs off (the switch, or "Disable"). The privacy statement says
   the host's request logs are off, so this step is part of deploying.
3. The App's client secret and callback URLs. Open
   https://github.com/organizations/OpenSpineConsortium/settings/apps/symphonyboard
   ("General" tab). Note the "Client ID" near the top. Under "Client
   secrets" press "Generate a new client secret" and copy the value shown
   once. Under "Identifying and authorizing users", add two callback URLs,
   one per field, pressing "Add Callback URL" for the second:
   `https://openspineconsortium.com/symphony/control/` and
   `https://openspineconsortium.com/symphony/cost.html` (GitHub matches
   the page's address against this list exactly, and either page can
   start the sign-in). Leave "Enable wildcard callback URLs" unticked if
   the box is there (GitHub advises against it). Leave "Expire user
   authorization tokens" ticked (the service refreshes them). Leave
   "Request user authorization (OAuth) during installation" unticked, and
   leave "Setup URL" and "Redirect on update" under "Post installation"
   exactly as they are: the install flow lands on the setup URL and this
   sign-in lands on the callback URL, two different things, and this
   change touches only the second. Press "Save changes" at the bottom.
4. The Worker's settings. Back on the Worker's page in Cloudflare, press
   "Settings", then "Variables and Secrets", then "Add": type "Text", name
   `GITHUB_CLIENT_ID`, value the Client ID; "Add" again: type "Secret",
   name `GITHUB_CLIENT_SECRET`, value the client secret. Press "Deploy" (or
   "Save and deploy") so the Worker restarts with them. `ALLOWED_ORIGIN`
   needs no setting: it is `https://openspineconsortium.com` when unset,
   and a value set for another origin must be a bare origin (no path, no
   slash at the end), since the service answers 503 not_configured until it
   is one. The client secret goes into this field and nowhere else: not
   into a chat, a file or a repository.
5. Tell the site. The Worker's address from step 1 and the Client ID from
   step 3 go into the two constants at the top of the site's
   assets/js/symphony-panel.js, `SIGNIN_SERVICE` and `CLIENT_ID`, by a
   pull request on openspineconsortium.github.io, which a session makes
   once the owner gives the two values (neither is a secret); "Sign in with
   GitHub", already the pages' first button, can then be pressed.

To check it: `curl https://symphony-signin.<account>.workers.dev/` answers
`{"service":"symphony-signin","routes":["/exchange","/refresh","/revoke"],"keeps":"nothing"}`,
and the panel's "Sign in with GitHub" lands back on the panel signed in.

Later, if the address is abused: the Workers free plan allows 100,000
requests a day across the account, and a loop against this address would
spend them and reach GitHub under the App's client id with bad codes. The
Worker takes an optional rate-limiting binding named `RATE_LIMITER`, which
Cloudflare configures through Wrangler (a `ratelimits` entry with that
`name`, a `namespace_id` and a `simple` limit such as 20 requests per 60
seconds; the binding's documentation is at
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/);
with it, each caller's address is held to the limit and the answer past it
is 429. Without it the service runs the same, with no limit of its own.

## Checks

`node --test signin/test_worker.mjs` runs test_worker.mjs, which drives
`handle()` with a fake GitHub: the origin check, the body limits in bytes,
the exchange with its verifier, the refresh, the revoke, the rate limit
when a binding is there, GitHub refusing or unreachable, and that nothing
but the five fields reaches the page. scripts/check.sh runs it when node
is on the path, as it is on GitHub's runners; the Python checks need no
node.
