# Security Policy

## Supported Versions

`reviewer-agent` is pre-0.1.0 closed-beta software. Security fixes are handled
on `main` until release branches exist.

## Reporting a Vulnerability

Please report security issues privately to the repository maintainer instead of
opening a public issue when the report includes exploit details, private data,
or credential material.

Include:

- affected commit or version
- operating system
- reproduction steps
- impact and any known workaround

## Local App Security Model

The desktop app runs a local Next.js server bound to `127.0.0.1`. Electron sets
a short-lived `REVIEWER_APP_TOKEN` for each app process and injects it into
requests from the app window. `/api/*` requests without that token are rejected
when the token is configured.

Direct `npm run dev` / `npm run start` usage is developer browser mode. Do not
bind it to a public interface or expose it through a tunnel unless you add your
own access control.

The app stores manuscripts, reviewer reports, settings, and API-provider
metadata locally under `REVIEWER_DATA_DIR` or the Electron user-data directory.
Do not load manuscripts containing PHI, PII, or embargoed content into cloud
providers unless you have the right to transmit that content to the configured
provider.
