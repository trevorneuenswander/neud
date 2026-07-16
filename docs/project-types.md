# Project Types

HMG Graphics Server supports multiple graphics project types. Each type is a self-contained module with its own controller, display, validation, types, and optional worker.

## Directory convention

Web code for a project type lives under:

```
src/graphics/[project-type]/
```

Worker code for a project type lives under:

```
workers/[project-type]/
```

## Adding a new project type

When a new graphics project is added to the platform:

1. Create `src/graphics/[project-type]/` with `components/`, `controller/`, `display/`, `types/`, and `validation/` subdirectories.
2. Create `workers/[project-type]/` if the project needs a background data collector.
3. Register the project type in portal project creation (future phase).
4. Document the project type in `docs/`.

## Shared vs. project-specific

| Shared (platform) | Project-specific |
|-----------------|------------------|
| Login, signup, dashboard | Controller UI |
| Project list and creation | Display pages |
| User management | Validation rules |
| Worker monitoring shell | Worker scraper logic |
| Display URL routing pattern | State shape and fields |

## Current project types

| Type | Status | Description |
|------|--------|-------------|
| `bag-graphics` | Planned | Live auction graphics with lot, bid, and sold information |

See [bag-graphics.md](./bag-graphics.md) for details on the first project type.
