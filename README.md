# reviewer-agent

A local-first desktop-ready workspace for academic manuscript revision and
methods work.

## Workspaces

### My Articles

Upload your own manuscript and use the agent for:

- revision from reviewer commentaries
- pre-submission manuscript review
- manuscript readiness checks
- reviewer-response drafting

### Methods Workbench

Build and audit study-method artifacts before and during manuscript
preparation:

- protocol creation and protocol audit
- SAP drafting
- data dictionary editing/import/export
- reporting checklist setup
- manuscript-readiness checks linked to My Articles

## Quick Start

```bash
npm install --include=dev
npm run dev
```

Open `http://localhost:3871`.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
```

## Data

SQLite data and markdown exports are stored under `REVIEWER_DATA_DIR`, defaulting
to `./data`.
