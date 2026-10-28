# Deploy runbook (#9, #19, #57)

One Ubuntu LTS droplet runs everything: nginx serves the web build at `/` and
proxies `/api/` to Express (pm2, port 5050). nginx terminates HTTPS itself
with a Let's Encrypt certificate from certbot.

Nothing in this repo contains an IP address on purpose: clients reach the
server by domain name only (#19). The droplet IP lives in the registrar's DNS
(GoDaddy) and nowhere else. Secrets live only in `.env` files on the droplet.

Files: `deploy/nginx.conf`, `deploy/ecosystem.config.js`, `deploy/deploy.sh`.

## One-time setup

1. **Droplet.** DigitalOcean: Ubuntu LTS, smallest size, add the team's SSH
   keys. Log in as a sudo user (not root) for every step below. Create it
   once, as root:
   ```bash
   adduser --disabled-password --gecos '' deploy && usermod -aG sudo deploy && rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
   echo 'deploy ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/90-deploy && sudo chmod 440 /etc/sudoers.d/90-deploy   # no password exists, so sudo must not ask
   ```
2. **DNS at the registrar (GoDaddy).** Add `A` records for `@` and `www`
   pointing at the droplet IP, TTL 600, with domain forwarding off. Wait until
   `dig +short <domain>` returns the droplet IP before the HTTPS step.
3. **Packages.**
   ```bash
   sudo apt update && sudo apt install -y nginx git
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
   ```
   The firewall keeps port 5050 private; only nginx reaches Express.
4. **MongoDB** (pick one; the app only reads `MONGODB_URI`).
   - Atlas free tier: create a cluster and a database user, allow the
     droplet's IP under Network Access, copy the `mongodb+srv://...` string.
     The seed step needs `mongosh`: install the `mongodb-mongosh` package from
     MongoDB's apt repo, or run the seed from a laptop against the Atlas URI.
   - On the droplet (MongoDB 8.0, Ubuntu 24.04), then use
     `mongodb://localhost:27017`:
     ```bash
     curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
     echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
     sudo apt update && sudo apt install -y mongodb-org
     sudo systemctl enable --now mongod
     ```
     `mongodb-org` includes `mongosh`, and `mongod` listens on 127.0.0.1 only.
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
   nano backend/.env   # PORT=5050, MONGODB_URI=<from step 4>, CLIENT_URL=https://<domain>, JWT_SECRET=<random, see .env.example>, SENDGRID_API_KEY, EMAIL_FROM
   chmod 600 backend/.env
   echo 'VITE_API_URL=/api' > web/.env   # same-origin, so no domain or IP baked into the build
   ```
   `CLIENT_URL` must be `https://<domain>` (the HTTPS origin browsers use).
   Without `SENDGRID_API_KEY` no email is sent: the verify and reset links only show in the server log
   (`pm2 logs api`). `EMAIL_FROM` must be a Single Sender verified in SendGrid.
   Load the database once: see `backend/db/README.md`.
7. **nginx site.**
   ```bash
   sed 's/DOMAIN_PLACEHOLDER/<domain>/g' deploy/nginx.conf | sudo tee /etc/nginx/sites-available/app
   sudo ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Re-running this `sed` overwrites the HTTPS block certbot adds; after
   re-running it, re-run the certbot command from step 8.
8. **HTTPS.**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d <domain> -d www.<domain> --non-interactive --agree-tos --redirect -m <email>
   ```
   Renewal is automatic: `systemctl list-timers | grep certbot` shows the
   timer, and `sudo certbot renew --dry-run` tests it.
9. **First deploy and boot persistence.**
   ```bash
   bash deploy/deploy.sh
   pm2 startup   # prints one sudo command; run it so the API restarts after a reboot
   ```

## Each deploy

```bash
cd /var/www/POOSD_large_proj && bash deploy/deploy.sh
```

It pulls the current branch, installs backend deps, builds the web app into
`web/dist` (which nginx serves), and reloads the API with pm2. If only
`backend/.env` changed, run `pm2 reload api`. If only `web/.env` changed,
re-run the script: Vite bakes `VITE_API_URL` into the build.

## Verify

```bash
curl -s http://localhost:5050/api/health   # on the droplet: {"ok":true,"db":true}
curl -s https://<domain>/api/health        # from anywhere, through nginx
pm2 logs api --lines 50                    # if either fails
```

If MongoDB is unreachable at startup the API exits, so pm2 crash-loops and you
get connection refused on port 5050 (a 502 from nginx). Either one means the
API is down: `pm2 status`, `pm2 logs api`. A `MongooseServerSelectionError` in
`pm2 logs api` means check `MONGODB_URI` (and Atlas Network Access, if used).
`"db":false` only appears if the database drops after a successful start.
