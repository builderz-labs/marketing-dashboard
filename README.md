<div align="center">

# Makreting Dashboard

**The open-source marketing operations control center for AI agent teams.**

Run CRM, outreach, content, analytics, and automation workflows from one dashboard, powered by OpenClaw + SQLite.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

![Hermes Dashboard Overview](./public/hermes-dashboard-mission-control.png)

</div>

---

> **Alpha Software** — Hermes Dashboard is under active development. APIs, data models, and configuration behavior can change between releases.

## Why Hermes Dashboard?

Hermes is built for operator-led AI marketing systems where you need execution visibility and control, not disconnected tools.

- **Marketing system in one place** — CRM, outreach, content ops, analytics, experiments, and automations
- **OpenClaw-native operations** — Dynamic agent/squad discovery, cron templates, workspace and comms surfaces
- **Local-first stack** — Next.js + SQLite, no required external infra to run locally
- **Secure-by-default template posture** — Session auth, API key support, host lock, and writeback controls disabled by default
- **Production workflow support** — Deploy status, auditability, role-based access, and e2e-covered auth/API flows

## Screenshots

### Overview
![Hermes Dashboard CRM](./public/hermes-dashboard-mission-control.png)

### CRM
![Hermes Dashboard Overview](./public/hermes-dashboard-overview.png)



## Quick Start

> **Requires [pnpm](https://pnpm.io/installation)** — install with `npm install -g pnpm` or `corepack enable`.

```bash
git clone https://github.com/your-org/hermes-dashboard.git
cd hermes-dashboard
pnpm install
pnpm env:bootstrap
pnpm dev
```

Open `http://localhost:3000`.

Initial admin access is seeded from `AUTH_USER` / `AUTH_PASS` on first run when the users table is empty.

## Project Status

### What Works

- CRM leads, pipeline funnel, source tracking, and engagement APIs
- Outreach sequencing, pause/audit endpoints, and suppression workflows
- Content operations with calendar, item, and performance APIs
- Analytics/KPI views with optional connectors (Plausible, GA4, social)
- Dynamic OpenClaw agent discovery for agents and squads
- Cron jobs/templates with OpenClaw-compatible schedule variants (`cron`, `every`, `at`)
- Deploy status endpoint with OpenClaw config validation preflight
- Session auth + API key auth with role-based access controls

### Known Limitations

- Alpha surface area is still evolving; expect occasional schema/UI shifts
- Certain integrations require external provider setup and credentials

### Security Considerations

- Change seeded credentials (`AUTH_USER`, `AUTH_PASS`, `API_KEY`) before network deployment
- Keep host lock enabled unless you explicitly need broader access (`HERMES_HOST_LOCK=local` by default)
- Keep writeback flags disabled unless required:
  - `HERMES_ALLOW_POLICY_WRITE=false`
  - `HERMES_ALLOW_CRON_WRITE=false`
  - `HERMES_ALLOW_WORKSPACE_WRITE=false`
- Never commit real credentials or personal data

## Architecture

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript |
| Data | SQLite (local state in `./state`) |
| Agent Runtime | OpenClaw CLI + filesystem integration |
| Auth | Session cookie + API key + optional Google OAuth |

## Configuration

See [`.env.example`](.env.example) for the full list.

### Required

- `AUTH_USER`
- `AUTH_PASS` (minimum 10 chars)
- `API_KEY`
- `AUTH_COOKIE_SECURE` (`false` for HTTP local dev, `true` for HTTPS)

### OpenClaw / Multi-instance

- `HERMES_OPENCLAW_HOME`
- `HERMES_DEFAULT_INSTANCE`
- `HERMES_OPENCLAW_INSTANCES` (optional JSON array for multi-instance)

### Optional 1Password Runtime Overlay

- `HERMES_1PASSWORD_MODE=off|auto|required` (`auto` is default behavior)
- `HERMES_OP_ENV_FILE=/etc/hermes-dashboard/hermes-dashboard.op.env`
- Example mapping: `ops/1password/hermes-dashboard.op.env.example`

### Host Access Lock

- `HERMES_HOST_LOCK=local` (default)
- `HERMES_HOST_LOCK=off`
- `HERMES_HOST_LOCK=host1,host2`

## Development

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## Template Export and Hygiene

Before publishing as a template or sharing broadly:

```bash
./scripts/template-audit.sh
./scripts/template-export.sh [output_dir]
```

Export excludes sensitive/runtime artifacts like `.env*`, database files, `.next`, and `node_modules`.

## Open Source

- License: [MIT](./LICENSE)
- Security: [SECURITY.md](./SECURITY.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Third-Party Notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)



## Contributing

Contributions welcome. Read the [contribution guidelines](CONTRIBUTING.md) first.

## ❤️ Support the Project

If you find this project useful, consider supporting my open-source work.

[![Sponsor](https://img.shields.io/badge/Sponsor-support-orange?logo=githubsponsors)](https://github.com/sponsors/your-org)

**Solana donations**

`BYLu8XD8hGDUtdRBWpGWu5HKoiPrWqCxYFSh4oxXuvPg`


---

<div align="center">

**Need agent infrastructure, trading systems, or Solana applications built for your team?**

[Builderz](https://builderz.dev) ships production AI systems — 32+ products across 15 countries.

[Get in touch](https://builderz.dev) | [@nyk_builderz](https://x.com/nyk_builderz)

</div>

## License

[![CC0](https://licensebuttons.net/p/zero/1.0/88x31.png)](https://creativecommons.org/publicdomain/zero/1.0/)

To the extent possible under law, the authors have waived all copyright and
related or neighboring rights to this work.

---

<p align="center">
  <a href="https://star-history.com/#your-org/hermes-dashboard&Date">
    <img src="https://api.star-history.com/svg?repos=your-org/hermes-dashboard&type=Date" alt="Star History" width="400">
  </a>
</p>

