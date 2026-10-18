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
when the person presses "Forget the token" and when a new sign-in or a
pasted token takes the place of a sign-in's token. `GET /` says what the service
is. It keeps nothing: no store, no cookie, no log of its own; it answers
only the site's origin; it never sees a Claude token and never reads a
repository. The owner decided this shape on 2026-10-13: the control panel
is a site page with a small stateless sign-in service acting through the
App's user token (symphony-template's CLAUDE.md), and the Apps' privacy
statement (symphony-start's PRIVACY.md, version 9) says the same to the
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

## The drive routes, for the Folders tab

The control panel's Folders tab, https://openspineconsortium.com/symphony/control/#folders,
makes a repository track files and folders of a person's OneDrive: one
press connects the drive, the tab draws the drive's folders to pick
from, GitHub's own form makes the repository from the template, and one
press writes the repository's file `.github/symphony/drive.json` and its
secret `SYMPHONY_DRIVE_REFRESH` and starts the first sync, which the
repository's workflow drive-sync.yml then repeats every half hour
(symphony-template's docs/research/drive-sync.md). The tab is one of the
console's, so it uses the console's one sign-in and its one repository
picker. Microsoft's consent, like GitHub's, comes back as a one-time code
to the control panel's own address, the page GitHub's sign-in returns to
as well: the page tells the two returns apart by the state each left
with, and after Microsoft's it opens the Folders tab itself. Exchanging
the code takes the app registration's client secret, which no page can
hold; so this Worker holds that secret too and takes three more routes,
in the same shape as the GitHub ones. OneDrive is the one provider for now: the
owner declined the browser API key Google's Picker takes (2026-10-18), so
Google Drive waits for a way that needs none, and a request naming any
other provider is answered 400 `unknown_provider`.

- `GET /drive/config` answers `{"microsoft": {"client_id": "..."}}`, the
  public client id the page starts the consent with, or
  `{"microsoft": null}` while the two Microsoft settings below are not
  both set, which the Folders tab says in one line. It needs no origin: the
  client id is public anyway.
- `POST /drive/connect`, from the site's origin alone, with
  `{provider, code, code_verifier, redirect_uri}`: `provider` is
  `microsoft`, `code` what Microsoft sent the page back with,
  `code_verifier` the PKCE secret the page made for this consent, and
  `redirect_uri` the control panel's own address, exactly
  `https://openspineconsortium.com/symphony/control/` with its trailing
  slash (or the same path on `ALLOWED_ORIGIN`); any other path, the old
  `folders.html` and the address without its slash among them, and any
  query or fragment are refused, so the service exchanges no code for any
  other page. The Worker posts them with the client id, the secret and the
  scope `Files.ReadWrite offline_access` to
  `https://login.microsoftonline.com/common/oauth2/v2.0/token` and hands
  back only `{access_token, refresh_token, expires_in, scope}`; the id
  token and the rest stay here and are dropped. The page holds the two
  tokens in its memory, lists the drive with the first and seals the
  second into the repository's secret.
- `POST /drive/token` with `{provider, refresh_token}`: the same endpoint
  with `grant_type=refresh_token` and the scope, back only
  `{access_token, expires_in}`. This is what the repository's run calls
  at the start of every sync (`SYMPHONY_DRIVE_TOKEN_URL` in
  drive-sync.yml, this Worker's `/drive/token` unless the repository's
  variable names another) and what the page calls when its access token
  runs out during a sitting. A run is no browser and sends no `Origin`
  header, so this one route takes a call with none; one from another
  origin is refused as everywhere. Microsoft issues a new refresh token
  with each access token, which the Worker drops: the run cannot write a
  secret, so the repository keeps the one the page sealed, which lasts
  90 days from the connection, and the page says when to connect again.

Microsoft's own error words come back as `{error, error_description}`
with Microsoft's status where it refused the request (a 400 or a 401),
and as 502 when Microsoft answered no token, no JSON or nothing. The
routes keep nothing, as the GitHub ones keep nothing: no store, no cookie,
no log of their own; the refresh token passes through on Connect and on
every sync and is held nowhere here. The optional `RATE_LIMITER` holds
these routes to the same limit as the others; the runs of one repository
come from GitHub's shared runner addresses, so a limit set tight enough
to bite them would be felt there first. The drive routes read a body of
up to 8 KB, twice the GitHub routes' 4 KB, since a Microsoft consent code
or refresh token runs to a few thousand characters.

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
6. The Microsoft app registration, for the Folders tab. Open
   https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
   (Microsoft Entra ID, App registrations) and press "New registration":
   name it `Symphony`, under "Supported account types" choose "Accounts
   in any organizational directory (Any Microsoft Entra ID tenant -
   Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)", and
   under "Redirect URI" choose the platform "Web" and enter
   `https://openspineconsortium.com/symphony/control/`, with its trailing
   slash, since Microsoft matches the address exactly, as this service
   does; press "Register". It is the same address step 3 already lists as
   SymphonyBoard's first callback URL, the control panel's own page, so
   GitHub's sign-in needs no new callback URL: the page tells Microsoft's
   return from GitHub's by the state each left with. On the
   registration's "Overview" note the "Application (client) ID". Open
   "Certificates & secrets", press "New client secret", give it a
   description and the longest expiry offered, press "Add", and copy the
   secret's "Value" at once (it is shown this once; its "Secret ID" is
   not the value). Open "API permissions", press "Add a permission",
   "Microsoft Graph", "Delegated permissions", tick `Files.ReadWrite`
   (under Files) and `offline_access` (under OpenId permissions), press
   "Add permissions"; `User.Read` may stay or go, the page never asks for
   it, and no "Grant admin consent" press is needed: both are permissions
   a person consents to for themselves. Nothing under "Authentication"
   needs changing: the "Web" platform is right (a "Single-page
   application" platform would refuse the client secret), and no implicit
   grant box is ticked. When the secret runs out, make a new one here and
   change it in the Worker's settings.
7. The Worker's new code. A Worker deployed before the drive routes
   merged runs the old code, which answers 404 on `/drive/config` and
   refuses the console's address for a drive. Open
   https://github.com/OpenSpineConsortium/symphony-app/blob/main/signin/worker.js
   once the pull request that brings the drive routes has merged, and
   press "Copy raw file" (the copy button above the code). In Cloudflare,
   on the Worker `symphony-signin`'s page, press "Edit code", replace
   everything in the editor with what you copied, and press "Deploy". The
   settings of steps 2 and 4 stay as they are: the editor changes the
   code alone.
8. The Worker's drive settings. On the Worker's page in Cloudflare,
   "Settings", "Variables and Secrets", "Add": type "Text", name
   `MICROSOFT_CLIENT_ID`, value the Application (client) ID; "Add" again:
   type "Secret", name `MICROSOFT_CLIENT_SECRET`, value the secret's
   Value from step 6. Press "Deploy". The client secret goes into this
   field and nowhere else: not into a chat, a file or a repository.
   `curl https://symphony-signin.<account>.workers.dev/drive/config`
   then answers `{"microsoft":{"client_id":"..."}}`; before this step it
   answers `{"microsoft":null}` and the Folders tab says the owner has
   not set OneDrive up yet. Saving the repository's secret from the tab
   also needs SymphonyBoard's repository permission Secrets (read and
   write), apart from the organization permission Secrets the Tokens tab
   uses; where the App does not hold it yet, open
   https://github.com/organizations/OpenSpineConsortium/settings/apps/symphonyboard/permissions,
   under "Repository permissions" set "Secrets" to "Read and write" and
   press "Save changes", and each installation is asked to accept the
   change. Until it is accepted on the installation, the tab says so at
   Track and writes nothing; a fine-grained token pasted into the page
   needs the same repository permission.

To check it: `curl https://symphony-signin.<account>.workers.dev/` answers
`{"service":"symphony-signin","routes":["/exchange","/refresh","/revoke","/drive/config","/drive/connect","/drive/token"],"keeps":"nothing"}`,
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
`handle()` with a fake GitHub and a fake Microsoft: the origin check, the
body limits in bytes, the exchange with its verifier, the refresh, the
revoke, the rate limit when a binding is there, GitHub refusing or
unreachable, that nothing but the five fields reaches the page, and the
drive routes: the config's one provider, the connect's form and its four
fields, the token's two, the run's call with no origin, the control
panel's own address as the one redirect (its old Folders page and the
address without its trailing slash refused), a provider the table lacks, and Microsoft's refusals
passed through with their status. scripts/check.sh runs it when node
is on the path, as it is on GitHub's runners; the Python checks need no
node.
