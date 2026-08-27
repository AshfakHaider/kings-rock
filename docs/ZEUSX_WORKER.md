# ZeusX Posting Worker

KingsRock is the source of truth for stock accounts. The website only queues stock accounts and exposes a token-protected worker API. The actual ZeusX browser automation must run outside Vercel on a Mac, VPS, or remote desktop with a persistent Chrome login.

## Website Environment

Set this on Vercel/Render where KingsRock runs:

```bash
ZEUSX_WORKER_TOKEN=use-a-long-random-server-only-token
```

Do not prefix this with `NEXT_PUBLIC_`.

## Worker Environment

Run the worker on the machine that can run the ZeusX Chrome automation:

```bash
KINGSROCK_BASE_URL=https://kings-rock.vercel.app
ZEUSX_WORKER_TOKEN=the-same-token-from-the-website
ZEUSX_POSTER_SCRIPT=/absolute/path/to/zeusx-poster.mjs
ZEUSX_WORK_DIR=.zeusx-worker
ZEUSX_BATCH_LIMIT=3
CDP_URL=http://127.0.0.1:9222
```

`ZEUSX_POSTER_SCRIPT` is optional if you use the bundled `scripts/zeusx-poster.mjs`. Set it only when you want the worker to call a different local copy of the ZeusX automation. The worker generates a temporary `listings.json`, downloads stock images from signed KingsRock URLs, and then runs that poster script.

## Run

Start Chrome in the same way the existing ZeusX automation expects, then run:

```bash
npm install playwright
node scripts/zeusx-worker.mjs
```

The worker:

1. Fetches stock accounts where ZeusX is enabled and status is `pending` or `failed`.
2. Downloads up to 15 signed stock images per account.
3. Converts each account into the existing ZeusX listing format.
4. Marks the account `posting`.
5. Runs `zeusx-poster.mjs`.
6. Marks the account `posted` or `failed`.

## Notes

- Existing stock data is not migrated or rewritten by the worker.
- The worker token is required for both fetching pending listings and updating posting status.
- Signed image URLs expire after one hour, so the worker downloads images immediately before posting.
- If a listing needs to be reposted, an admin can set its ZeusX status back to `pending` from the Stock page.
