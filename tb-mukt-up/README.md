# TB Mukt Uttar Pradesh

Production-ready web application for TB Mukt Gram Panchayat tracking in Uttar Pradesh.

```text
tb-mukt-up/
├── frontend/   # Angular 19
└── backend/    # Node.js + Express + MSSQL
```

## Prerequisites

- Node.js 18+ (20 recommended)
- Access to MSSQL `Facility` database
- Set `MSSQL_PASSWORD` in `backend/.env` (never commit real secrets)

## Backend setup

```bash
cd tb-mukt-up/backend
cp .env.example .env   # if needed
# edit .env and set MSSQL_PASSWORD + JWT_SECRET
npm install
npm run inspect-schema   # inspect existing Facility tables
npm run init-db          # create TB Mukt tables only; map existing location masters when found
npm run dev
```

API: `http://localhost:5055`



Seeded admin (fallback locations):

- Username: `admin`
- Password: `Admin@12345`

## Frontend setup

```bash
cd tb-mukt-up/frontend
npm install
npm start
```

App: `http://localhost:4200`

## Features

- Cascading location APIs (State → Village / TB Unit)
- JWT + bcrypt auth, registration, forgot/reset password
- RBAC + geography scoping
- TB monthly entry with draft/submit and indicator calculations
- Bronze / Silver / Gold consecutive yearly medals
- State / District / Block dashboards with Excel export

## Notes

1. Existing Facility master tables are preferred via `tb_mukt_location_map` after schema inspection.
2. Fallback `tb_mukt_*` location tables are created only for app bootstrapping and do not alter existing Facility masters.
3. Upload the official Excel reference and logo if you want exact field mapping / branding replacement (`frontend/src/assets/logo.png`).
