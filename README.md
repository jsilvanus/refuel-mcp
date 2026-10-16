# Refuel MCP

PostgreSQL-backed MCP server for conversational vehicle refuelling history. Its MCP Streamable HTTP and optional OAuth implementation are based on [Code Stash's API connector scaffold](https://github.com/jsilvanus/codestash/tree/main/mcp/api-connector-style).

## MVP

- Streamable HTTP MCP endpoint at `/mcp`, protected by one configured bearer token mapped to one application user.
- PostgreSQL storage for users, OAuth authorization codes/refresh tokens, cars, refuelling records and audit history.
- Read-only resources: `fuel://cars`, `fuel://cars/default`, `fuel://cars/{carId}`, `fuel://cars/{carId}/months`, `fuel://cars/{carId}/months/{month}`, `fuel://summary/months/{month}`, and `fuel://summary/year/{year}`.
- Two write tools: `save_car` and `save_refueling_record`.
- OAuth Authorization Code + PKCE S256 and CIMD-first client identification are included as an opt-in mode. External OIDC federation is a later phase.

## Run with Docker

Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD`, `MCP_PUBLIC_URL`, and `MCP_BEARER_TOKEN` to a long random secret (at least 32 characters). Then run `docker compose up --build -d`. Configure the MCP client to connect to `${MCP_PUBLIC_URL}/mcp`.

For local development use Node.js 22+ and PostgreSQL 16+, then run `npm install`, configure `.env`, `npm run build`, and `npm test`. The schema is created on startup. Use PostgreSQL backups/PITR for durable storage.

## Authentication

The MVP uses a configured bearer token mapped to the single configured application user; client-supplied user IDs are ignored. The copied OAuth flow can be enabled with `AUTH_MODE=oauth`, `JWT_SECRET` (base64 of at least 32 random bytes), `MCP_DEFAULT_USER_EMAIL`, and `MCP_DEFAULT_USER_PASSWORD`. OAuth mode issues tokens bound to the configured issuer and MCP resource. External OIDC identity-provider integration remains future work.

Do not expose the OAuth login publicly before adding rate limiting, account recovery, account lifecycle controls and other production hardening described in the Code Stash scaffold.

## Data rules

Every query is scoped to the authenticated user. Monetary amounts and litres use PostgreSQL `NUMERIC`. When both total paid and price/litre are supplied, their product with litres must agree within €0.03; if one is omitted, the other is derived. Deletion requires an existing record ID and exactly `litres: 0`; deletion is soft and audited. Positive litres can restore a soft-deleted record. Lower odometer readings are preserved and marked untrusted; trust is recalculated after changes.
