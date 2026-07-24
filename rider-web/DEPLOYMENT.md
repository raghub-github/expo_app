# GatiMitra – Docker deployment (second Next.js app on same VPS)

This app runs as the **second** Next.js service on your Ubuntu VPS: **port 3001** (first app stays on 3000). System Nginx on the host reverse-proxies to both.

---

## 1. Build and run with Docker Compose

On the server (in the project directory):

```bash
# Create .env from example and edit with real values
cp .env.example .env
nano .env

# Build and start
docker compose build --no-cache
docker compose up -d

# Check logs
docker compose logs -f gatimitra
```

One-off build and run (without docker-compose):

```bash
docker build -t gatimitra .
docker run -d --name gatimitra-app -p 3001:3001 --env-file .env gatimitra
```

---

## 2. System Nginx: proxy second domain/subdomain to port 3001

Your **first** app is already proxied to port 3000. Add a **second** server block for this app (GatiMitra) so Nginx forwards a different domain or subdomain to **3001**.

Create a new config (e.g. for subdomain `gatimitra.yourdomain.com`):

```bash
sudo nano /etc/nginx/sites-available/gatimitra
```

Paste (replace `gatimitra.yourdomain.com` with your domain or subdomain):

```nginx
server {
    listen 80;
    server_name gatimitra.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/gatimitra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

For HTTPS, use Certbot (after the HTTP server block is active):

```bash
sudo certbot --nginx -d gatimitra.yourdomain.com
```

Result:

- First Next.js app: `yourdomain.com` (or `app.yourdomain.com`) → Nginx → `127.0.0.1:3000`
- GatiMitra (this app): `gatimitra.yourdomain.com` → Nginx → `127.0.0.1:3001`

---

## 3. Avoiding port conflicts

- **Host ports:** Each app gets a unique host port. First app: `3000`, this app: `3001`. In `docker-compose.yml`, `ports: "3001:3001"` maps host 3001 → container 3001.
- **Container port:** The app inside the container listens on `3001` (`PORT=3001` in Dockerfile/Compose). No conflict with the other container (different container, same port number is fine).
- **Check usage:**  
  `sudo ss -tlnp | grep -E '3000|3001'`  
  Before starting, ensure nothing else is bound to 3001: `sudo lsof -i :3001`.

---

## 4. Useful commands

| Task | Command |
|------|--------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Rebuild after code change | `docker compose up -d --build` |
| View logs | `docker compose logs -f gatimitra` |
| Shell in container | `docker compose exec gatimitra sh` |
| Restart | `docker compose restart gatimitra` |

---

## 5. Best practices for multiple Next.js apps on one VPS

1. **One host port per app**  
   App 1 → 3000, App 2 (GatiMitra) → 3001. Never map two containers to the same host port.

2. **System Nginx as single entrypoint**  
   Nginx handles TLS and routing; containers only need to listen on localhost (127.0.0.1). No Nginx inside Docker for these apps.

3. **Use `.env` per project**  
   Each app has its own `.env` (and `docker-compose.yml` with `env_file: .env`). Do not commit `.env`; use `.env.example` as a template.

4. **Standalone output**  
   `next.config.js` uses `output: 'standalone'` so the image only ships the minimal runtime (no full `node_modules`), reducing size and attack surface.

5. **Resource limits (optional)**  
   To avoid one app starving the other, you can add in `docker-compose.yml` under the service:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
   ```
   Adjust per app and VPS size.

6. **Separate project directories**  
   Keep each app in its own directory with its own `Dockerfile` and `docker-compose.yml`. Run `docker compose` from each app’s directory, or use a single compose file with multiple services and different `build` contexts.

7. **Naming**  
   Use distinct service and container names (e.g. `gatimitra`, `gatimitra-app`) so logs and `docker ps` are clear.

8. **Restart policy**  
   `restart: unless-stopped` in Compose ensures containers come back after reboot or crash.

---

## 6. File summary

| File | Purpose |
|------|--------|
| `Dockerfile` | Multi-stage build: deps → build → standalone runner on port 3001 |
| `docker-compose.yml` | Builds and runs the app, maps 3001:3001, loads `.env` |
| `.dockerignore` | Keeps image small by excluding node_modules, .git, .env, etc. |
| `.env` | Runtime env vars (create from `.env.example`, do not commit) |
| `next.config.js` | Includes `output: 'standalone'` for Docker |

Your first app stays on 3000; this one runs on 3001 with Nginx routing by domain/subdomain as above.
