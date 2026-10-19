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
only the site's origin, but for the drive routes below, whose config
answers anyone and whose token route takes a call with no origin; it never
sees a Claude token and never reads a repository. The owner decided this shape on 2026-10-13: the control panel
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
acts as the signed-in person, within the App's permissions (the
repository's Contents, Issues, Pull requests, Checks, Workflows, Actions,
Administration, Secrets and Metadata, and an organization's Secrets and
Variables, as ../manifest.json asks for them and the Apps' privacy
statement lists them) and within the person's own access, the
intersection of the two, and only on the repositories the App is
installed on. A permission added to the App after an installation is
asked of that installation, which accepts it on its settings page (step 8
below has the clicks); until it does, the panel says which press waits on
it. A fine-grained token pasted into the page needs the same permissions
of its own.

## The device routes, for the Home Screen app

The control panel installs as a Home Screen app (site pull request #86,
the first of the three ways in symphony-template's
docs/research/native-ios-app.md). A sign-in that leaves the app for
GitHub's page may come back to the browser rather than into the app, so
the installed app signs in by a code instead, through GitHub's device
flow, which a GitHub App may turn on and which needs no client secret
(https://raw.githubusercontent.com/github/docs/main/content/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app.md,
"Using the device flow"). `POST /device` asks GitHub's
`https://github.com/login/device/code` for a code with the App's client
id alone and hands back the short code the person types at
https://github.com/login/device (always that page, whatever address
GitHub's answer names), the device code the page keeps, and how long
and how often to ask. `POST /device/token` sends GitHub the device code,
with the client id and the device flow's grant type and no secret, and
hands back the same five fields as `/exchange` once the person has typed
the code and allowed SymphonyBoard; until then GitHub's own word comes
back with 400 (`authorization_pending`, or `slow_down` with a longer
interval), and so do its refusals (`expired_token`, `access_denied`,
`device_flow_disabled`). GitHub answering a 5xx, or a 429 with no word
of its own, is no refusal: it comes back as 502 `github_unreachable`,
which the page asks again at the same pace until the code runs out, so
a moment of GitHub's trouble while the person types the code does not
waste it. The token is the same eight-hour token with the same
six-month refresh token, which the panel renews through `/refresh` as
any other. The service adds nothing but the one thing a page cannot do
itself: GitHub's login endpoints answer no browser's cross-origin
request. The routes answer the site's origin alone and spend the rate
limit like the others; the device code is a bearer credential for the
fifteen minutes it lives, held in the open page's memory and nowhere
else.

The site ships sign-in by code switched off: `CODE_SIGNIN = false` in
assets/js/symphony-panel.js, and while it is off no page offers a code
and the installed app's "Sign in with GitHub" leaves for GitHub's page
as a browser's does, so these routes are never asked. Turning it on is
the owner's choice (step 9 below), because of what the device flow
opens beyond this service:

- Anyone can start a SymphonyBoard code. Ticking "Enable Device Flow"
  turns the device flow on for SymphonyBoard everywhere, not only
  through this Worker: any program can ask
  https://github.com/login/device/code for a code with the App's client
  id, which is public, and poll GitHub for the token, and the Worker's
  origin check and rate limit are not on that path. Whoever asked for a
  code gets the token it earns. A person talked into typing someone
  else's code at https://github.com/login/device and allowing
  SymphonyBoard there, on a page that names SymphonyBoard exactly as it
  does for a code the panel showed, hands that someone a token that acts
  as them, eight hours at a time and renewable until it is revoked (next
  point), with every permission SymphonyBoard has (manifest.json lists
  them: Actions, Actions variables, Administration, Checks, Contents,
  Issues, Pull requests, Secrets, Workflows, and an organization's
  Secrets and Variables, all write, and Metadata read) on every
  repository the App is installed on that the person can reach.
  The redirect sign-in cannot be turned against someone this way: its
  code comes back only to the panel's registered address and is
  exchanged only with the PKCE secret that page made. GitHub's own
  guidance is not to enable the device flow without reason: "an
  attacker can use the device flow to remotely impersonate your app as
  part of a phishing attack"
  (https://raw.githubusercontent.com/github/docs/main/content/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app.md,
  "Don't enable device flow without reason"). The panel warns beside
  every code it shows to type it only there and only when the panel
  started it a moment before, and the project never sends anyone a code;
  nothing can stop a code someone else started.
- A sign-in by code's refresh token renews at GitHub with the client id
  alone, and never runs out while it is renewed. Of `client_secret`,
  GitHub's
  https://raw.githubusercontent.com/github/docs/main/content/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens.md
  says "Required unless the user access token was generated using the
  device flow", and the same page says a refresh gives "a new user
  access token and a new refresh token", whose `refresh_token_expires_in`
  "will always be `15897600` (6 months)"
  (https://raw.githubusercontent.com/github/docs/main/data/reusables/apps/user-access-token-response-parameters.md).
  Each renewal starts six months afresh, so the six months bound only a
  sign-in nobody renews: whoever holds one, phished, read from a lost
  phone that kept it, or read from the browser by a script on the site,
  can renew it at GitHub without this service for as long as they like,
  and the owner's levers over every redirect sign-in, deleting the
  client secret or stopping this Worker, do not end it. It lasts until
  it is revoked, by one of these:
  - For one person: they revoke SymphonyBoard at
    https://github.com/settings/apps/authorizations ("Authorized GitHub
    Apps", Revoke beside SymphonyBoard), which ends every token
    SymphonyBoard holds for them, a phished one and a lost phone's among
    them. GitHub lets no organization owner do that for a member. The
    App's owner, given any one of that person's SymphonyBoard tokens,
    ends them all with GitHub's "Delete an app authorization",
    `DELETE https://api.github.com/applications/<client id>/grant` with
    the token in the body, signed with the client id and the client
    secret as for `/revoke`. "Forget the token" in the panel is no lever
    here: it sends `/revoke` (GitHub's "Delete an app token") for the
    sign-in that tab and that browser hold and no other, and every code
    earns a token of its own, so it never reaches one someone else holds
    (whether GitHub ends the refresh token of the one it does revoke is
    not measured).
  - For everyone at once: GitHub documents no button that revokes every
    user token of a GitHub App. The App's owner can suspend SymphonyBoard
    on an installation (`PUT /app/installations/<id>/suspended`, as the
    App with its JWT, one installation at a time and through the API
    only), which blocks the App from that account's repositories; an
    organization's owner can uninstall SymphonyBoard from the
    organization; and deleting the App, the last resort, ends every token
    it ever gave. Whether a suspension stops user tokens as well as the
    App's own is not measured.

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
  The route redeems whatever refresh token it is sent, for any caller:
  the Origin check binds nothing a program cannot set, and the repository
  holds no client secret. So the sealed secret is a bearer credential for
  whoever can run a workflow on the repository, anyone who may write to
  it: with it and this route they reach every file of the drive, which
  `Files.ReadWrite` covers, until it lapses or the person withdraws
  Symphony's access at Microsoft (https://account.live.com/consent/Manage
  for a personal account, My Apps at https://myapps.microsoft.com for a
  work or school one); deleting the secret withdraws nothing there. The
  Folders tab and the privacy statement say so to the person. Binding the
  secret to the one repository, by a refresh token this Worker wraps with
  the repository's id and a GitHub Actions OIDC token checked on this
  route, would stop a copied secret working anywhere else, though not a
  collaborator who may run a workflow there; it is a change of its own.

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
6. The Worker's new code. A Worker deployed before the drive routes
   merged runs the old code, which answers 404 on `/drive/config` and
   refuses the console's address for a drive. Open
   https://github.com/OpenSpineConsortium/symphony-app/blob/main/signin/worker.js
   once the pull request that brings the drive routes has merged, and
   press "Copy raw file" (the copy button above the code). In Cloudflare,
   on the Worker `symphony-signin`'s page, press "Edit code", replace
   everything in the editor with what you copied, and press "Deploy". The
   settings of steps 2 and 4 stay as they are: the editor changes the
   code alone. This step comes before the Microsoft registration so that
   nothing is copied between that registration's client secret and the
   field it goes into.
7. The Microsoft app registration, for the Folders tab. Sign in with a
   Microsoft account whose own Microsoft Entra tenant you may register
   apps in, never a university or employer account: a registration
   belongs to the tenant it is made in and cannot be moved out of it, and
   a university's tenant may forbid it. A personal Microsoft account with
   no tenant cannot register an app until it has one; signing up for a
   free Azure account at https://azure.microsoft.com/free makes one, named
   "Default Directory". If the directory named under your account at the
   top right is another one, press the Settings gear, then "Directories +
   subscriptions", and switch to yours first. Open
   https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
   (Microsoft Entra ID, App registrations) and press "New registration":
   name it `Symphony`, and under "Supported account types" open the
   drop-down and choose "Any Entra ID Tenant + Personal Microsoft
   accounts" (an older portal lists it as "Accounts in any organizational
   directory (Any Microsoft Entra ID tenant - Multitenant) and personal
   Microsoft accounts (e.g. Skype, Xbox)"). Where the form shows a
   "Redirect URI" field, choose the platform "Web" and enter
   `https://openspineconsortium.com/symphony/control/`, with its trailing
   slash, since Microsoft matches the address exactly, as this service
   does. Press "Register". Then open "Authentication": on its "Redirect
   URI configuration" tab the address must be listed under "Web",
   trailing slash included; where it is not, press "Add Redirect URI",
   choose the "Web" tile, enter the address and press "Configure". Never
   put it under "Single-page application", which would refuse the client
   secret, and tick no implicit-grant box. It is the same address step 3
   already lists as SymphonyBoard's first callback URL, the control
   panel's own page, so GitHub's sign-in needs no new callback URL: the
   page tells Microsoft's return from GitHub's by the state each left
   with. On the registration's "Overview" note the "Application (client)
   ID"; it is public, so it may be written down anywhere. Open "API
   permissions", press "Add a permission", "Microsoft Graph", "Delegated
   permissions", tick `Files.ReadWrite` (under Files) and
   `offline_access` (under OpenId permissions), and press "Add
   permissions"; `User.Read` may stay or go, the page never asks for it.
   No "Grant admin consent" press is needed here, since that press grants
   only this tenant. A personal Microsoft account consents for itself; a
   work or school account's organization decides for its people:
   Microsoft's risk-based step-up consent, on by default, sends a consent
   for an unverified multitenant app to an administrator, and many
   organizations allow consent only for apps from a verified publisher,
   so such an account sees "Need admin approval" until its IT department
   approves Symphony or this registration is publisher verified (a free
   Microsoft partner ID, under "Branding & properties";
   symphony-template's docs/research/drive-sync.md lists OneDrive at
   Wayne State as not yet tried). Last, open "Certificates & secrets",
   press "New client secret", give it a description and the longest
   expiry offered (24 months at most), press "Add", copy the secret's
   "Value" at once (it is shown this once; its "Secret ID" is not the
   value), and go straight to step 8 before copying anything else. The
   secret's last day is shown beside it ("Expires"): note that date where
   you will see it, for example in the title of an issue on symphony-app.
   From that day Microsoft refuses every exchange the Worker makes, so
   Connect in the Folders tab fails, and so does every repository's drive
   sync, whose run goes red with `invalid_client`; nobody but you can mend
   it. A registration holds more than one secret at a time, so before
   that day make a new one here, set it as `MICROSOFT_CLIENT_SECRET` as
   step 8 says, and delete the old one.
8. The Worker's drive settings. On the Worker's page in Cloudflare,
   "Settings", "Variables and Secrets", "Add": type "Secret", name
   `MICROSOFT_CLIENT_SECRET`, value the secret's Value you have just
   copied in step 7; "Add" again: type "Text", name `MICROSOFT_CLIENT_ID`,
   value the Application (client) ID. Press "Deploy". The client secret
   goes into this field and nowhere else: not into a chat, a file or a
   repository. `curl https://symphony-signin.<account>.workers.dev/drive/config`
   then answers `{"microsoft":{"client_id":"..."}}`; before this step it
   answers `{"microsoft":null}` and the Folders tab says the owner has
   not set OneDrive up yet. Saving the repository's secret from the tab
   also needs SymphonyBoard's repository permission Secrets (read and
   write), the same repository permission the Tokens tab uses on a
   personal account's repository, beside the organization permission
   Secrets it uses on an organization's. Where the App does not hold it
   yet, open
   https://github.com/organizations/OpenSpineConsortium/settings/apps/symphonyboard/permissions,
   under "Repository permissions" set "Secrets" to "Read and write" and
   press "Save changes". Each installation is then asked to accept the
   change, the organization's own included: open
   https://github.com/organizations/OpenSpineConsortium/settings/installations,
   press "Configure" beside SymphonyBoard, then "Review request" in the
   banner and "Accept new permissions" (GitHub also emails the
   organization's owners a link to the same page; check the two button
   names there, which this text could not see). Until it is accepted on
   the installation, the tab says so as it opens and Track writes
   nothing; a fine-grained token pasted into the page needs the same
   repository permission.

9. Sign-in by code, for the Home Screen app: the owner's switch, off
   until the owner turns it on. The site ships it off
   (`CODE_SIGNIN = false` in assets/js/symphony-panel.js): no page
   offers a code, and the installed app's "Sign in with GitHub" leaves
   for GitHub's page as a browser's does. Turn it on only if that
   sign-in, tried in the installed app on a real iPhone, does not come
   back into the app (symphony-template's docs/research/native-ios-app.md
   lists that test as not yet measured), and record the choice as a
   Decision, since it is a trade the owner makes for everyone: ticking
   "Enable Device Flow" lets anyone start a SymphonyBoard code and talk
   a person into typing it, which hands whoever started it a token that
   acts as that person with SymphonyBoard's permissions, renewable at
   GitHub without this service and without end, each renewal good for
   six months more, until the person or the owner revokes it. "The
   device routes" above says it in full, with what ends such a token.

   To turn it on, in this order. First the Apps' privacy statement
   (symphony-start's PRIVACY.md) gets a version that describes sign-in
   by code, with its page at /symphony/apps-privacy.html live: the two
   routes, the device code the page sends every five seconds or more,
   the client id alone and no secret, the renewal without the secret,
   and the warning above; version 33, live now, describes the redirect
   alone. Then open
   https://github.com/organizations/OpenSpineConsortium/settings/apps/symphonyboard
   ("General" tab), tick "Enable Device Flow" (under "Identifying and
   authorizing users") and press "Save changes". Then give the Worker
   the code that has the device routes, as step 6 does, if it does not
   have them yet: open
   https://github.com/OpenSpineConsortium/symphony-app/blob/main/signin/worker.js
   once the pull request that brings them has merged, press "Copy raw
   file", and in Cloudflare, on the Worker `symphony-signin`'s page,
   press "Edit code", replace everything in the editor with what you
   copied and press "Deploy". Last, a pull request to the site that sets
   `CODE_SIGNIN = true`; once it merges, the installed app's "Sign in
   with GitHub" shows a code, a browser offers "Sign in with a code
   instead" beside it, and the panel's "What this page keeps and sends"
   names the code's requests. K29 in panel-checks/e2e2/code.test.mjs
   holds that the site ships the switch off, so that no pull request
   turns it on unnoticed; the owner's pull request comes with one here
   that turns K29 round. None of these steps touches a secret.

   To turn it off again, in the other order. First a pull request to the
   site that sets `CODE_SIGNIN = false`, so no page offers a code: with
   the switch on and the box unticked, `/device` answers 502
   `device_flow_disabled`, and the installed app, whose "Sign in with
   GitHub" asks for a code, would be left with the token box alone. Then
   untick "Enable Device Flow" and save, which stops anyone starting a
   new SymphonyBoard code. That order is for turning it off at leisure.
   When the device flow is being abused, a person phished with a code or
   a page found handing out SymphonyBoard codes, untick the box first
   and the site's pull request follows: the switch does nothing to stop
   a code someone else starts, the tick is the open door, and the cost
   of unticking first is only that the installed app offers the token
   box alone until the site's pull request lands. Neither step ends a
   token already made: a sign-in by code works eight hours at a time and
   renews, through this service or at GitHub with the client id alone,
   each renewal good for six months more, so it never ends by itself
   while its holder renews it; it ends only when it is revoked as "The
   device routes" above says, which after abuse means each person who
   typed a code revokes SymphonyBoard at
   https://github.com/settings/apps/authorizations, or the owner uses
   one of the levers listed there for everyone. Whether unticking the
   box also stops GitHub renewing those is not measured.

To check it: `curl https://symphony-signin.<account>.workers.dev/` answers
`{"service":"symphony-signin","routes":["/exchange","/refresh","/revoke","/device","/device/token","/drive/config","/drive/connect","/drive/token"],"keeps":"nothing"}`,
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
unreachable, that nothing but the five fields reaches the page, the
device routes (the code asked with the client id and no secret, GitHub's
page the only one named, the times bounded, GitHub's waiting words and
refusals passed through with 400 and anything else 502, a malformed
device code refused before GitHub is asked, GitHub's 5xx and a 429 with
no word of its own answered as `github_unreachable` while its refusals
keep their words, and the origin and the rate limit as for the others), and the drive routes: the config's one provider, the connect's form and its four
fields, the token's two, the run's call with no origin, the control
panel's own address as the one redirect (its old Folders page and the
address without its trailing slash refused), a provider the table lacks,
and Microsoft's refusals passed through with their status. scripts/check.sh runs it when node
is on the path, as it is on GitHub's runners; the Python checks need no
node.
