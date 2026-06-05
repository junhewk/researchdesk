# Contributing

This project is early-stage desktop software. Keep changes narrow and verify
the affected workflow before opening a pull request.

## Development

```bash
nvm use
npm install --include=dev
npm run lint
npm test
npm run build
```

The required runtime is Node.js 26.x.

## Security and Privacy

Do not commit real manuscripts, reviewer reports, API keys, local database
files, or private endpoint URLs. Use placeholders in examples.

The app is local-first, but cloud providers may receive manuscript text when
the user configures and chooses them. Any privacy-sensitive feature must make
that transmission boundary explicit in the UI or docs.
