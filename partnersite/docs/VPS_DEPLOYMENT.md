# VPS Deployment Guide — Ubuntu 22.04 LTS (Hostinger)

Deploy the Next.js Merchant Dashboard with Docker, GitHub Actions CI/CD, and optional Nginx reverse proxy.

---

## Part 1 — VPS setup (Ubuntu 22.04)

Run as root or with sudo.

### 1. Update system

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Docker

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3. Add deploy user and add to docker group

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
```

### 4. SSH key authentication (for GitHub Actions)

On your **local machine** (or GitHub Actions will use its own key):

```bash
ssh-keygen -t ed25519 -C "deploy@vps" -f deploy_key -N ""
```

On the **VPS**, as root:

```bash
sudo mkdir -p /home/deploy/.ssh
sudo touch /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Add the **public** key (`deploy_key.pub`) into `/home/deploy/.ssh/authorized_keys`. For GitHub Actions, add the **private** key (`deploy_key`) as GitHub secret `VPS_SSH_KEY`.

### 5. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 6. Clone repo and prepare app directory

As user `deploy` (or root, then chown):

```bash
sudo mkdir -p /opt/dashboard
sudo chown deploy:deploy /opt/dashboard
sudo -u deploy git clone https://github.com/YOUR_ORG/partnersite.git /opt/dashboard
```

Create production env (do not commit):

```bash
sudo -u deploy cp /opt/dashboard/.env.production.example /opt/dashboard/.env.production
sudo -u deploy nano /opt/dashboard/.env.production
```

### 7. First run with Docker Compose

```bash
cd /opt/dashboard
docker compose --env-file .env.production up -d --build
docker compose ps
curl -s http://127.0.0.1:3000/api/health
```

---

## Part 2 — Optional Nginx reverse proxy

### 1. Install Nginx on host (if not using Nginx container)

```bash
sudo apt install -y nginx
```

Or use the Nginx container in `docker-compose.yml` (uncomment the `nginx` service), and use Certbot on the host or in another container.

### 2. SSL with Certbot (on host)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

For Nginx-in-Docker, mount certs and use `nginx.conf` (replace `DOMAIN` with your domain). Obtain certs on host first:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

Then mount `/etc/letsencrypt` into the Nginx container (see commented `docker-compose.yml` volumes).

### 3. Cloudflare

- Set DNS to proxy (orange cloud).
- Origin server: use your VPS IP and Nginx (80/443).
- SSL/TLS: Full (strict) and use Cloudflare Origin Certificate on Nginx if desired.

---

## Part 3 — GitHub Actions secrets

In GitHub: **Settings → Secrets and variables → Actions**, add:

| Name         | Value                    |
|--------------|--------------------------|
| `VPS_HOST`   | VPS IP or domain         |
| `VPS_USER`   | `deploy`                 |
| `VPS_SSH_KEY`| Full contents of private key (`deploy_key`) |

Workflow triggers on push to `main`: checkout → build (verify) → SSH to VPS → `git pull` → `docker compose down` → `docker compose up -d --build` → wait for `/api/health` then exit.

---

## Part 4 — Zero-downtime behavior

- Workflow runs `docker compose down` then `docker compose up -d --build`. New container starts; after healthcheck passes, old process is already replaced.
- For true zero-downtime (no brief 502), put Nginx or a load balancer in front and use blue/green or rolling update; for single-node, the current approach minimizes downtime.

---

## Part 5 — Security checklist

- [ ] **UFW**: Only 22, 80, 443 open; default deny incoming.
- [ ] **Fail2ban**: `sudo apt install fail2ban`; configure `sshd` jail.
- [ ] **SSH**: Disable root login and password auth.
  - Edit `/etc/ssh/sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no`, `PubkeyAuthentication yes`.
  - Restart: `sudo systemctl restart sshd`.
- [ ] **SSH key only**: Use `VPS_SSH_KEY` in GitHub; no passwords.
- [ ] **Docker**: Restrict socket if needed (e.g. `usermod -aG docker deploy` only for deploy user).
- [ ] **Secrets**: All secrets in `.env.production` and GitHub Secrets; never in repo.
- [ ] **Logging**: Application and Nginx logs under `/var/log` or Docker logs; rotate with logrotate.
- [ ] **Updates**: Regular `apt update && apt upgrade` and image rebuilds.

---

## Quick reference

| Item              | Value / Command |
|-------------------|-----------------|
| App directory     | `/opt/dashboard` |
| Compose env       | `docker compose --env-file .env.production up -d --build` |
| Health endpoint   | `GET /api/health` |
| Dashboard port    | `127.0.0.1:3000` (internal only when behind Nginx) |
