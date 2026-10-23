# Public documentation policy

Public-facing NEUD materials must describe **general platform capabilities**.

They must **not** disclose:

- Client or customer names
- Private project names
- Customer-specific adapters, scrapers, controllers, or display templates
- Named project packages that identify a customer or private production
- Private integrations or customer implementation details

## Applies to

- README
- Website (neud.io) copy and SEO metadata
- GitHub Release descriptions
- Public changelogs and release notes under `docs/releases/`
- Public roadmap summaries
- Product descriptions and future marketing materials

## Internal documentation

Internal development documentation (for example `AGENTS.md`, maintainer runbooks, package catalogs, and private test fixtures) **may** remain project-specific so maintainers can build and test the software.

Do not remove technical information required for maintainers to build, package, or validate NEUD.

## Writing guidance

Prefer platform-level language:

| Avoid (public) | Prefer (public) |
| --- | --- |
| Named customer package updates | Project package and template refinements |
| Client auction scraper polling | External data collection reliability |
| Named manual controller for a client | Manual data management controls |
| Named LED / ticker / bid templates | Graphics templates and display layouts |

When in doubt, describe the capability, not the customer.
