# Deploying on a home Docker host behind Caddy

This fork's `docker-compose.yml` is hardened for a LAN deployment where a Caddy
reverse proxy already terminates HTTPS. Compared with upstream:

| | Upstream | This fork |
|---|---|---|
| Image | pulls `ghcr.io/.../gmail-cleaner:latest` on every start | built from this checkout |
| Web UI (8766) | published on all interfaces, no auth | not published; reached only via Caddy with basic_auth |
| OAuth callback (8767) | published on all interfaces | bound to 127.0.0.1 on the host; used once over an SSH tunnel |
| Container caps | default | `cap_drop: ALL`, `no-new-privileges` |

The app itself has **no authentication** on its API. Anyone who can reach port
8766 can trash mail or export sender lists. Caddy's `basic_auth` is what stands
in for that, so do not publish 8766 directly.

## 1. Google OAuth client

Follow the upstream README, "Get Google OAuth Credentials", with these choices:

- Application type: **Web application**
- Authorized redirect URI: `http://localhost:8767/` (exactly this, nothing else)
- Add your Gmail address as a **Test user**

Save the downloaded JSON as `credentials.json` in the project folder on the host.

Google rejects IP addresses in redirect URIs and requires HTTPS for anything
other than localhost. The app hardcodes `http://` for custom hosts, so the
upstream README's dynamic-DNS approach will not pass Google's validation.
The `localhost` redirect plus an SSH tunnel below sidesteps all of that.

## 2. Host setup

```bash
git clone https://github.com/jamesonwildwood/gmail-cleaner.git ~/gmail-cleaner
cd ~/gmail-cleaner
# copy credentials.json here
```

Confirm the docker network Caddy is attached to and set it if it is not `wiki_default`:

```bash
docker inspect caddy --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
echo "PROXY_NETWORK=<that name>" > .env      # only if different from wiki_default
```

## 3. Caddy site block

Add to the Caddyfile and reload (`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`
from the Caddy project directory, or however you normally reload).

```
mail.home.imagineyou.com {
	import common
	tls {
		dns cloudflare {$CF_API_TOKEN}
	}
	basic_auth {
		jameson <bcrypt hash>
	}
	reverse_proxy gmail-cleaner:8766
}
```

Generate the hash with `docker compose exec caddy caddy hash-password` and paste
the output. Use a password that is not reused anywhere else; this login is the
only thing between the WiFi and your mailbox.

## 4. First start and one-time sign-in

From your laptop, open a tunnel that carries `localhost:8767` to the host's loopback:

```bash
ssh -L 8767:127.0.0.1:8767 jameson@geekom
```

In that SSH session:

```bash
cd ~/gmail-cleaner
docker compose up -d --build
docker compose logs -f
```

Then, on the laptop:

1. Open `https://mail.home.imagineyou.com`, enter the basic_auth login, click **Sign In**.
2. Copy the `https://accounts.google.com/o/oauth2/...` URL from the logs into the laptop browser.
3. Approve. Google redirects the browser to `localhost:8767`, the tunnel delivers it to the container.
4. Logs show `OAuth complete! Token saved.` The token lives in `./data/token.json` on the host.

The tunnel is only needed while signing in. Close it afterwards.

## 5. Token expiry

While the Google Cloud OAuth consent screen is in **Testing** status, refresh
tokens expire after 7 days and you will repeat step 4 weekly. Switching the
publishing status to **In production** removes the 7-day expiry. The
"unverified app" warning remains and you click through it once.

To reset auth entirely: `docker compose down && rm -f ./data/token.json && docker compose up -d`.

## 6. Updating

```bash
cd ~/gmail-cleaner && git pull && docker compose up -d --build
```

To pull upstream fixes into the fork first, review the diff before merging:
`git fetch upstream && git log --oneline main..upstream/main`.
