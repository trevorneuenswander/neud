# Webpage Scraper Data Engine

The first implemented Data Engine type is `webpage-scraper`.

## BAG adapter

The BAG auction adapter preserves the reference output:

- `prev`, `current`, `next`, `lots`, `lastSold`, `auctionDisplay`, `updatedAt`

### Source keys

| Key | Type | Purpose |
|-----|------|---------|
| `vehicles` | page | Main listing page |
| `login` | login | Authentication page |
| `auction-display` | display | Jumbotron display page |

These keys are supported by the BAG adapter but are not required for all Webpage Scraper engines.

## Credentials

Login credentials remain on the worker host:

- `BAG_AUCTION_EMAIL`
- `BAG_AUCTION_PASSWORD`

Never store credentials in Supabase.

## Health

Health is calculated from heartbeat age, snapshot freshness, desired vs actual state, and recent failures.

## Retention

- Latest 100 snapshots per engine
- Latest 500 log entries per engine

## Poll interval

Settings reload each worker loop. Changes apply without process restart. Headless mode changes require restart.

## Puppeteer timeouts

Configure on the worker host (not in Supabase):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PUPPETEER_PROTOCOL_TIMEOUT_MS` | 300000 | CDP protocol calls |
| `PUPPETEER_PAGE_TIMEOUT_MS` | 60000 | Page default timeout |
| `PUPPETEER_NAVIGATION_TIMEOUT_MS` | 60000 | Navigation and selector waits |

BAG scrape steps are logged with `[bag] <step> completed/failed` timing. Operational logs include the failing step name in metadata when a scrape or protocol timeout occurs.

## Failed Run Once

When Run Once fails:

- Desired state is unchanged
- Command becomes `failed`
- Controls re-enable when no active command remains
- Browser session is closed and recreated on the next run
