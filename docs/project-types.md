# Project Types

NEUD supports multiple graphics project types. Each type is a self-contained module with its own controller, display, validation, types, and optional worker.

In the portal UI, the user-facing term for how a Project receives data is **Data Type**. The database column remains `project_type` for compatibility.

## Directory convention

Web code for a project type lives under:

```
src/graphics/[project-type]/
```

Worker code for a project type lives under:

```
workers/[project-type]/
```

## Adding a new data type

When a new data-ingestion type is added to the platform:

1. Create `src/graphics/[project-type]/` with `components/`, `controller/`, `display/`, `types/`, and `validation/` subdirectories when web modules are needed.
2. Create `workers/[project-type]/` if the project needs a background data collector.
3. Add the enum value in a new migration (`alter type public.project_type add value ...`).
4. Register the data type in `src/lib/projects/constants.ts` and the New Project form.
5. Document the type in `docs/`.

## Shared vs. project-specific

| Shared (platform) | Project-specific |
|-----------------|------------------|
| Login, signup, dashboard | Controller UI |
| Project list and creation | Display pages |
| Project member management | Validation rules |
| Worker monitoring shell | Worker scraper logic |
| Display URL routing pattern | State shape and fields |

## Current data types

| Stored value | User-facing label | Status |
|--------------|-------------------|--------|
| `webpage-scraper` | Webpage Scraper | Available for creation |
| `json-ingest` | JSON Ingest | Available for creation |
| `google-sheet-ingest` | Google Sheet Ingest | Available for creation |
| `bag-graphics` | BAG-Graphics | Legacy enum value; existing Projects only |

Data types classify how a Project will receive data. Scraper, JSON, and Google Sheets ingestion are not implemented yet.

The PostgreSQL enum is `public.project_type`. Legacy Projects may still have `project_type = 'bag-graphics'`.

See [bag-graphics.md](./bag-graphics.md) for details on the first graphics module.
See [projects.md](./projects.md) for Projects schema and authorization.
