# Deploy pipeline — TB Mukt UP

Production site: `https://tbmukht.demoquaeretech.in`

## What was added

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Build frontend + backend on every push/PR |
| `.github/workflows/deploy.yml` | Build + **upload** to server on `main` (or manual run) |

## One-time GitHub setup

1. Open repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Add these secrets:

| Secret | Example | Required |
|--------|---------|----------|
| `DEPLOY_HOST` | `tbmukht.demoquaeretech.in` or server IP | Yes |
| `DEPLOY_USERNAME` | `deploy` / FTP user | Yes |
| `DEPLOY_PASSWORD` | server password | Yes\* |
| `DEPLOY_SSH_KEY` | private key PEM | Yes\* (password **or** key) |
| `DEPLOY_PORT` | `22` | No (default 22) |
| `DEPLOY_FRONTEND_PATH` | `/var/www/tbmukht/frontend` or IIS site path | Yes |
| `DEPLOY_BACKEND_PATH` | `/var/www/tbmukht/backend` | Yes |
| `DEPLOY_RESTART_CMD` | `pm2 restart tbmukt-api` | No |

\* Use **either** `DEPLOY_PASSWORD` **or** `DEPLOY_SSH_KEY`.

3. Confirm secret **values** match the live server (FileZilla paths):

- `DEPLOY_FRONTEND_PATH` = `/var/www/html/tbmukht.demoquaeretech.in/dist`
- `DEPLOY_BACKEND_PATH` = `/var/www/html/tbmukht.demoquaeretech.in/api`

### Fix: `error: missing server host`

`DEPLOY_HOST` was empty for the workflow. Add/update repository secrets, push latest `deploy.yml`, then **Actions → Build & Deploy → Run workflow**.

## How to upload / deploy

### A) Automatic
Push to `main` (changes under `tb-mukt-up/`) → workflow **Build & Deploy** runs.

### B) Manual
1. GitHub → **Actions → Build & Deploy → Run workflow**
2. Choose target: `both` / `frontend` / `backend`
3. Run

### C) Local build (no upload)
```bash
cd tb-mukt-up/frontend
npm ci
npm run build -- --configuration=production
# output: dist/frontend/browser

cd ../backend
npm ci --omit=dev
```

## Server notes

- **Do not overwrite** `backend/.env` on the server (pipeline excludes it).
- After first backend upload, on the server once:
  ```bash
  cd <DEPLOY_BACKEND_PATH>
  npm ci --omit=dev
  # ensure .env exists with MSSQL_* and JWT_SECRET
  pm2 start server.js --name tbmukt-api   # or your process manager / IIS node handler
  ```
- Frontend is static files — point IIS / nginx document root to `DEPLOY_FRONTEND_PATH`.

## Frontend API URL

Production build uses `environment.prod.ts`:

```ts
apiUrl: 'https://tbmukht.demoquaeretech.in/api'
```
