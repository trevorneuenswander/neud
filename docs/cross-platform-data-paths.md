# Cross-platform NEUD data paths

Application data lives under the Electron **userData** directory.

## Windows

| Resource | Path |
| -------- | ---- |
| Root | `%APPDATA%\NEUD\` |
| SQLite database | `%APPDATA%\NEUD\data\neud.sqlite` |
| Logs | `%APPDATA%\NEUD\logs\` |
| Live display pipeline | `%APPDATA%\NEUD\logs\live-display-pipeline.jsonl` |
| Engine logs | `%APPDATA%\NEUD\logs\engines\` |
| Exports / diagnostic zips | `%APPDATA%\NEUD\exports\` |
| Config | `%APPDATA%\NEUD\config\` |
| Projects / assets | `%APPDATA%\NEUD\projects\`, `%APPDATA%\NEUD\assets\` |

## macOS

| Resource | Path |
| -------- | ---- |
| Root | `~/Library/Application Support/NEUD/` |
| SQLite database | `~/Library/Application Support/NEUD/data/neud.sqlite` |
| Logs | `~/Library/Application Support/NEUD/logs/` |
| Live display pipeline | `~/Library/Application Support/NEUD/logs/live-display-pipeline.jsonl` |
| Engine logs | `~/Library/Application Support/NEUD/logs/engines/` |
| Exports / diagnostic zips | `~/Library/Application Support/NEUD/exports/` |
| Config | `~/Library/Application Support/NEUD/config/` |

## Preferred access

Use **Help → Export Diagnostics** in NEUD Desktop for a redacted bundle instead of manually copying sensitive directories.
