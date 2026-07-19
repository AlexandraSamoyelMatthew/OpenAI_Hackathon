# Alex.OS — AI Code Reviewer

## Run locally

1. In PowerShell, copy the environment template: `Copy-Item .env.example .env`
2. Add your `OPENAI_API_KEY` to `.env` for live reviews. Without it, the app runs in safe demo mode.
3. Start it with `node server.mjs`
4. Open [http://localhost:3020](http://localhost:3020)

The key stays on the server; it is never sent to the browser. The reviewer is educational assistance, not a replacement for professional security assessment.

