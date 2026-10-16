# Refuel MCP

PostgreSQL-backed MCP server for conversational vehicle refuelling history. Reuses the MCP Streamable HTTP and OAuth authorization-code + PKCE scaffold in [Code Stash](https://github.com/jsilvanus/codestash/tree/main/mcp/api-connector-style).

## MVP

- Streamable HTTP MCP endpoint at `/mcp`, OAuth Authorization Code + PKCE S256, CIMD-first client identification and resource-bound JWT access tokens.
- PostgreSQL storage for users, OAuth codes/refresh tokens, cars, refuelling records and audit history.
- Resources: `fuel://cars`, `fuel://cars/default`, `fuel://cars/{carId}`, `fuel://cars/{carId}/months`, `fuel://cars/{carId}/months/{month}`, `fuel://summary/months/{month}`, `fuel://summary/year/{year}`.
- Write tools: `save_car`, `save_refueling_record`.
- One application user is configured by default. External OIDC federation and multi-user identity mapping are deferred.

## Run

Copy `.env.example` to `.env`; set `POSTGRES_PASSWORD`, `MCP_PUBLIC_URL`, `JWT_SECRET` (base64 of 32+ random bytes), `MCP_DEFAULT_USER_EMAIL`, and `MCP_DEFAULT_USER_PASSWORD`. Then run `docker compose up --build -d`. Configure the MCP client at `${MCP_PUBLIC_URL}/mcp`. For local development use Node.js 22+ and PostgreSQL 16+, then `npm install && npm run build && npm test`.

Schema migration runs on startup. Use PostgreSQL backup/PITR for durable storage. Do not expose publicly before adding rate limiting, account recovery, session/credential lifecycle and other production auth hardening described in the Code Stash scaffold.

## Data rules

All queries are scoped to the authenticated subject; client-supplied user IDs are never trusted. Monetary amounts and litres use PostgreSQL NUMERIC. When both total paid and price/litre are submitted, their product with litres must agree within €0.03; if one is omitted, the other is derived. Deleting requires an existing record ID and exactly `litres: 0`; deletion is soft and audited. Positive litres can restore a soft-deleted record. Lower odometer readings are preserved and marked untrusted; trust is recalculated after changes.

The initial local email/password OAuth sign-in is not external OIDC federation. Multi-user OIDC identity-provider integration remains a separate phase.
