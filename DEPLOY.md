# Deploying on a home Docker host behind Caddy

This fork's `docker-compose.yml` is hardened for a LAN deployment where a Caddy
reverse proxy already terminates HTTPS. Compared with upstream:

| | Upstream | This fork |
|---|---|---|
| Image | pulls `ghcr.io/.../gmail-cleaner:latest` on every start | built from this checkout |
| Web UI (8766) | published on all interfaces, no auth | not published; reached only via Caddy with basic_auth |
| OAuth callback (8767) | published on all interfaces, plain HTTP | not published; Caddy serves it over HTTPS at a path on the same hostname |
| Container user | root | your uid/gid (`PUID`/`PGID`, default 1000) |
| Container caps | default | `cap_drop: ALL`, `no-new-privileges` |

The app itself has **no authentication** on its API. Anyone who can reach port
8766 can trash mail or export sender lists. Caddy's `basic_auth` is what stands
in for that, so do not publish 8766 directly.

## 1. Google OAuth client

In Google Cloud Console (a project under your own Google account):

1. Enable the **Gmail API**.
2. **Google Auth Platform → Audience**: User type **External**, and add your Gmail address under **Test users**.
3. **Clients → Create client**: type **Web application**. Under **Authorized redirect URIs** add exactly:
   `https://<your-host>/oauth2callback` (for example `https://mail.home.example.com/oauth2callback`).
4. Download the JSON and save it as `credentials.json` in the project folder on the server.

Google requires HTTPS for any redirect URI that is not `localhost`, and rejects
IP addresses. Serving the callback through Caddy satisfies both.

## 2. Host setup

```bash
git clone https://github.com/jamesonwildwood/gmail-cleaner.git ~/gmail-cleaner
cd ~/gmail-cleaner
# copy credentials.json here
cat > .env <<EOT
OAUTH_REDIRECT_URI=https://mail.home.example.com/oauth2callback
# PROXY_NETWORK=wiki_default   # only if Caddy is on a different docker network
# PUID=1000
# PGID=1000
EOT
```

Find the docker network Caddy is attached to with
`docker inspect caddy --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`.

## 3. Caddy site block

Inside your wildcard site (or as its own site), route the callback path to
port 8767 and everything else to the UI on 8766, both behind `basic_auth`:

```
@mail host mail.home.example.com
handle @mail {
	basic_auth {
		jameson <bcrypt hash>
	}
	@oauth path /oauth2callback*
	handle @oauth {
		reverse_proxy gmail-cleaner:8767
	}
	handle {
		reverse_proxy gmail-cleaner:8766
	}
}
```

Generate the hash with `docker compose exec caddy caddy hash-password` in the
Caddy project directory, then validate and reload:

```bash
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
```

Use a password that is not reused anywhere else; this login is the only thing
between the WiFi and your mailbox.

## 4. First start and sign-in

```bash
cd ~/gmail-cleaner
docker compose up -d --build
docker compose logs -f
```

1. Open `https://mail.home.example.com`, enter the basic_auth login, click **Sign In**.
2. Copy the `https://accounts.google.com/o/oauth2/...` URL from the logs into any browser.
3. Approve. Google redirects to `/oauth2callback` on your hostname; Caddy hands it to the container.
4. Logs show `OAuth complete! Token saved.` The token lives in `./data/token.json`, owned by your user.

## 5. Token expiry

While the OAuth consent screen is in **Testing** status, refresh tokens expire
after 7 days and you repeat step 4 weekly. Switching the publishing status to
**In production** removes the 7-day expiry. The "unverified app" warning remains
and you click through it once.

To reset auth entirely: `docker compose down && rm -f ./data/token.json && docker compose up -d`.

## 6. Updating

```bash
cd ~/gmail-cleaner && git pull && docker compose up -d --build
```

To pull upstream fixes into the fork first, review the diff before merging:
`git fetch upstream && git log --oneline main..upstream/main`.
