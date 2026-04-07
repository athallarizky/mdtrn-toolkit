# Mdtrn Toolkit

Utility scripts for working with the Mdtrn dashboard API.

## Prerequisites

- Node.js (with TypeScript/ESM support)
- Mdtrn dashboard bearer token

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file or set the environment variable:

```bash
export MDTRN_TOKEN="your_bearer_token_here"
```

## Modules

### `notification/`

Scripts for fetching, extracting, and retrying failed (dead) HTTP notifications.

#### 1. Fetch Notifications

Fetches dead HTTP notifications from the Mdtrn API within a date range.

| Script | Output | Description |
|--------|--------|-------------|
| `notification/fetch-notifications.ts` | `notification-order-ids.json` | Fetches and groups **order IDs** by prefix (SUBS, auto_topup, plan, etc.) |
| `notification/fetch-notifications-grouped.ts` | `notification-grouped.json` | Fetches and groups **full notification items** by prefix |

Both scripts paginate through results with a configurable delay between requests to avoid rate limiting.

**Configurable constants** (edit in-file):
- `START_PAGE` / `END_PAGE` — pagination range
- `LIMIT` — items per page
- `START_DATE` / `END_DATE` — date filter (ISO 8601)
- `DELAY_MS` — delay between page requests

```bash
npx tsx notification/fetch-notifications.ts
npx tsx notification/fetch-notifications-grouped.ts
```

#### 2. Extract Order IDs

Extracts specific fields from the grouped notification data produced by `fetch-notifications-grouped.ts`.

**Input:** `notification-grouped.json`
**Output:**
- `extracted-{key}s.json` — all extracted values grouped by category
- `extracted-{key}s-by-category/` — one JSON file per category
- `extracted-{key}s-constants.ts` — TypeScript constants

**Configurable constants:**
- `EXTRACT_KEY` — which field to extract (`"id"`, `"order_id"`, `"endpoint"`, etc.)

```bash
npx tsx notification/extract-order-ids.ts
```

#### 3. Retry Notifications

Retries failed notifications using the Mdtrn API. Two modes:

| Script | Input | Description |
|--------|-------|-------------|
| `notification/retry-notifications.ts` | `extracted-ids.json` (from step 2) | Batch retry all extracted notification IDs |
| `notification/retry-notifications-manual.ts` | `NOTIFICATION_IDS` array (edit in-file) | Retry specific notification IDs |

Both process requests in configurable batches with delays between batches.

**Output:**
- `retry-results.json` (or `retry-results-manual.json`) — full results with timestamps
- `retry-failed-ids.json` — IDs that failed, for re-retry

**Configurable constants:**
- `BATCH_SIZE` — concurrent requests per batch
- `DELAY_BETWEEN_BATCHES_MS` — delay between batches

```bash
npx tsx notification/retry-notifications.ts
npx tsx notification/retry-notifications-manual.ts
```

#### Typical Workflow

```
notification/fetch-notifications-grouped.ts
                    |
                    v
     notification/extract-order-ids.ts
                    |
                    v
        notification/retry-notifications.ts
```

1. **Fetch** dead notifications for a given date range
2. **Extract** notification IDs from the grouped data
3. **Retry** the failed notifications in batches
