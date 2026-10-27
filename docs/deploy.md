# Deploy runbook (#9, #19, #57)

One Ubuntu LTS droplet runs everything: nginx serves the web build at `/` and
proxies `/api/` to Express (pm2, port 5000). Cloudflare does DNS and HTTPS
(orange-cloud proxy), so nginx only listens on port 80.

Nothing in this repo contains an IP address on purpose: clients reach the
server by domain name only (#19). The droplet IP lives in Cloudflare DNS and
nowhere else. Secrets live only in `.env` files on the droplet.

Files: `deploy/nginx.conf`, `deploy/ecosystem.config.js`, `deploy/deploy.sh`.

## One-time setup

1. **Droplet.** DigitalOcean: Ubuntu LTS, smallest size, add the team's SSH
   keys. Log in as a sudo user (not root) for every step below.
2. **DNS through Cloudflare.** Add the domain to Cloudflare and switch the
   registrar's nameservers to the two Cloudflare gives you. Add `A` records for
   `@` and `www` pointing at the droplet, proxied (orange cloud). In
   SSL/TLS, set the mode to **Flexible** (nginx is HTTP-only) and turn on
   **Always Use HTTPS**.
   - Alternative without the Cloudflare proxy (grey cloud): run
     `sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx`
     after step 7. Not configured here.
3. **Packages.**
   ```bash
   sudo apt update && sudo apt install -y nginx git
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   sudo ufw allow OpenSSH && sudo ufw allow 'Nginx HTTP' && sudo ufw enable
   ```
   The firewall keeps port 5000 private; only nginx reaches Express.
4. **MongoDB** (pick one; the app only reads `MONGODB_URI`).
   - Atlas free tier: create a cluster and a database user, allow the
     droplet's IP under Network Access, copy the `mongodb+srv://...` string.
   - On the droplet: install `mongodb-org` following MongoDB's Ubuntu guide,
     `sudo systemctl enable --now mongod`, and use `mongodb://localhost:27017`.
5. **Clone.**
   ```bash
   sudo mkdir -p /var/www && sudo chown "$USER" /var/www
   git clone https://github.com/polter-dev/POOSD_large_proj.git /var/www/POOSD_large_proj
   ln -s /var/www/POOSD_large_proj ~/POOSD_large_proj   # path used in backend/db/README.md
   ```
   The repo lives under `/var/www` so nginx can read `web/dist`.
6. **Env files** (never committed).
   ```bash
   cd /var/www/POOSD_large_proj
   cp backend/.env.example backend/.env
   nano backend/.env   # PORT=5000, MONGODB_URI=<from step 4>, CLIENT_URL=https://<domain>
   echo 'VITE_API_URL=/api' > web/.env   # same-origin, so no domain or IP baked into the build
   ```
   Load the database once: see `backend/db/README.md`.
7. **nginx site.**
   ```bash
   sed 's/DOMAIN_PLACEHOLDER/<domain>/g' deploy/nginx.conf | sudo tee /etc/nginx/sites-available/app
   sudo ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```
8. **First deploy and boot persistence.**
   ```bash
   bash deploy/deploy.sh
   pm2 startup   # prints one sudo command; run it so the API restarts after a reboot
   ```

## Each deploy

```bash
cd /var/www/POOSD_large_proj && bash deploy/deploy.sh
```

It pulls the current branch, installs backend deps, builds the web app (once
`web/package.json` exists), and reloads the API with pm2. If only
`backend/.env` changed, run `pm2 reload api`.

## Verify

```bash
curl -s http://localhost:5000/api/health   # on the droplet: {"ok":true,"db":true}
curl -s https://<domain>/api/health        # from anywhere, through Cloudflare + nginx
pm2 logs api --lines 50                    # if either fails
```

`"db":false` means the API is up but cannot reach MongoDB: check `MONGODB_URI`
(and Atlas Network Access). A Cloudflare 52x error means nginx or the API is
down: `sudo systemctl status nginx` and `pm2 status`.
