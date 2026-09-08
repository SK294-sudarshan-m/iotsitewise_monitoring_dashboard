# Execution Steps — Run Locally

## Prerequisites
- [Node.js](https://nodejs.org) 18+ (includes `npm`)
- Nothing else — no AWS credentials, no `.env` file, no backend service.

## 1. Get the code
```bash
git clone <repo-url>
cd Ultratech_IoTWise_Dashboard
```
If you received this as a folder/zip instead of via Git, just copy it as-is. The
`Data/` folder (JSON telemetry + reference Excel files) must stay a sibling of
`src/` — don't move it.

## 2. Install dependencies
```bash
npm install
```

## 3. Start the dev server
```bash
npm run dev
```
Open **http://localhost:5173** (Vite prints the exact URL; if 5173 is busy it
auto-picks the next free port).

## 4. Using the dashboard
- **Plant** selector + **Time Window** (Minutes / Hours / Days / All Available)
  at the top control all 5 panels at once.
- Panels: **All Sensor Data → Sensor Status → Common Aggregate Values → Top 5
  KPIs → Top 6–10 KPIs** — each expands/collapses independently.
- **Upload JSON** loads extra `*.json` telemetry files on top of what's in
  `Data/`. To add data permanently, drop a new `*.json` file into `Data/` and
  click **Refresh** — no server restart needed.

## 5. Stop the server
`Ctrl+C` in the terminal running `npm run dev`.

---

## Optional: test the production build
This is what actually ships to GitHub Pages — worth checking before a deploy.
```bash
npm run build
npm run preview
```
Opens a static preview of the `dist/` output at **http://localhost:4173**.

## Deploying
Pushing to `main` on GitHub triggers `.github/workflows/deploy.yml`, which
builds and publishes to GitHub Pages automatically (requires **Settings →
Pages → Source: GitHub Actions** to be set once per repo).

See [Implementation.md](Implementation.md) for how the code itself works.
