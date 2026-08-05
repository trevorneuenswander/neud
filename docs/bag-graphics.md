# BAG-Graphics

BAG-Graphics is the first graphics project type on NEUD. It monitors an auction website and drives live broadcast overlays.

Project type identifier: `bag-graphics`

## Features

BAG-Graphics provides:

- Current lot number
- Vehicle title
- Current bid
- Bid status
- Sold status
- Last sold information
- Ticker visibility controls
- Manual overrides
- OBS-compatible transparent displays

## Web modules

| Module | Location | Role |
|--------|----------|------|
| Components | `src/graphics/bag-graphics/components/` | BAG-specific UI pieces |
| Controller | `src/graphics/bag-graphics/controller/` | Operator control panel |
| Display | `src/graphics/bag-graphics/display/` | Transparent OBS browser sources |
| Types | `src/graphics/bag-graphics/types/` | BAG state and field types |
| Validation | `src/graphics/bag-graphics/validation/` | Input validation for BAG forms |

## Worker

The BAG worker runs as a separate Node.js process with Puppeteer. It continuously scrapes auction data and updates project state.

Worker location: `workers/bag-graphics/`

The worker is not deployed to Vercel. It runs on a host suited for long-running browser automation.

## Current status

Foundation setup is in progress. BAG controller, display, scraper, and realtime state are not yet implemented on this platform.

Existing BAG behavior from prior work will be migrated in a later phase without redesign unless explicitly requested.
