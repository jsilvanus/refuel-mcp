# Fuel Log MCP — Initial Specification

**Status:** Initial design decisions recorded; implementation details remain open. MVP authentication is single-user bearer-token authentication; multi-user OAuth 2.0/OIDC is a later phase.

## Purpose

Provide a multi-user MCP server for recording and querying vehicle refuelling history. Users can register multiple cars, choose a default car, record fuel purchases conversationally, retrieve monthly data and summaries, and correct earlier records.

## Core data model

### User

- Authenticated identity.
- User preferences, including an optional default car.

### Car

- Stable car ID.
- Owner/user ID.
- Display name or nickname.
- Optional registration identifier.
- Fuel type and other optional metadata.
- Default flag.
- Archive flag.

Each user may own multiple cars. A car's default and archive state are managed through `save_car`.

### Refuelling record

- Stable record ID.
- Owner/user ID and associated car ID.
- Refuelling date/time.
- Litres purchased.
- Total amount paid.
- Price per litre.
- Optional odometer reading, with an explicit trust status (trusted/untrusted) and validation metadata where needed.
- Optional station and notes.
- Creation and last-modification timestamps.
- Deletion state/timestamp if soft deletion is implemented.

Store monetary amounts and litres using fixed-precision decimal types, not binary floating-point. Keep litres, total paid and price per litre as separate submitted values and validate their consistency with an explicit rounding tolerance. Do not silently rewrite one value to force a match.

## MCP interface

The interface separates **read-only MCP resources** from **write MCP tools**.

### Resources — reads

Use resource templates for data that varies by car or month. Resource URIs below are illustrative; the final URI scheme can be settled during implementation.

- `fuel://cars` — cars belonging to the authenticated user.
- `fuel://cars/default` — the user's default car, if set.
- `fuel://cars/{carId}` — one car's details.
- `fuel://cars/{carId}/months` — months with available refuelling history for that car.
- `fuel://cars/{carId}/months/{yyyy-mm}` — that car's refuelling records for a calendar month.
- `fuel://summary/months/{yyyy-mm}` — a monthly summary across the user's cars.
- `fuel://summary/year/{yyyy}` — an annual summary and breakdown.

Monthly records should include the refuelling entries and useful totals, including litres purchased, total expenditure and weighted average price per litre. Summary resources should calculate these on the server. Resource responses should be bounded; add pagination if a response could become too large.

Support historical months, including an empty result for a month with no records. Provide a way to discover months that contain data.

### Tools — writes

Keep the primary write interface to two tools:

#### `save_car`

Create or update a car, and manage its default/archive state.

- If `car_id` is omitted, create a car.
- If `car_id` is supplied, update that existing car.
- On updates, omitted fields remain unchanged.
- `is_default: true` makes the car the user's default and clears the default flag on the user's other cars.
- `is_default: false` clears this car's default status, if set. A user may have no default car.
- `is_archived: true` archives the car while retaining its refuelling history.
- `is_archived: false` reactivates an archived car.
- Omitted status flags do not change existing status.
- An archived car cannot be the default. Archiving the current default clears its default status.
- Default selection must be enforced atomically so a user cannot end up with two default cars.

#### `save_refueling_record`

Create, update or delete a refuelling record.

- If `record_id` is omitted and `litres > 0`, create a record.
- If `record_id` is supplied and `litres > 0`, update that existing record.
- Updates are partial: omitted fields remain unchanged.
- If `record_id` is supplied and `litres = 0`, delete that record.
- If `record_id` is omitted and `litres = 0`, reject the request.
- Negative litres are invalid.
- A missing litres field is not equivalent to zero and must never trigger deletion.
- If an explicitly supplied record ID does not exist, return an error; do not create a replacement.
- Deletion does not require the caller to resupply the other record fields.

There is no separate delete-refuelling tool. Implement the zero-litres deletion path as a soft delete so accidental removals can be recovered and deletion history can be retained. Soft-deleted records must not appear in ordinary history or totals.

For conversational edits or deletions, identify the intended record unambiguously before calling the write tool. Do not guess when several records match.

## Multi-user security

- Derive the current user from authenticated server-side context. Never trust a model-supplied `user_id` as the authority for data access.
- **MVP:** Support **single-user bearer-token mode** only. A securely configured bearer credential maps all requests to one configured application user. **Later phase:** Add multi-user OAuth 2.0/OIDC, where users authenticate through an external OpenID Connect identity provider and each authenticated identity maps to its own application user.
- In single-user bearer mode, treat the configured token as a secret: do not expose it in logs, resource output, errors, or client-visible metadata. A client-supplied user ID must not change the identity associated with this token.
- In the later multi-user mode, validate access tokens for issuer, audience/resource, expiry and signature (or use the provider's supported token-validation mechanism); derive identity from validated claims and map it to an internal user. Do not treat an unvalidated ID token as an API access token.
- For the MVP, configure bearer authentication explicitly and reject missing or invalid credentials. Do not allow client-supplied user IDs to change the configured identity. When multi-user mode is added, keep it explicit in configuration and never silently fall back to a shared/default user if authentication fails.
- Every car and refuelling read/write must enforce ownership on the server.
- Knowing or guessing another user's car or record ID must not grant access.
- A user's default car must belong to that user and must not be archived.
- A refuelling record must reference a car owned by the same user.
- Apply the same authorization and validation rules to create, update and deletion paths.

## Statistics and consumption

Support purchase statistics from refuelling data alone:

- Total spend and litres purchased by period.
- Average purchase price per litre, weighted by litres.
- Monthly and annual breakdowns and price trends.
- Per-car and all-cars summaries.

Odometer readings are optional in the initial schema. When a submitted odometer reading is lower than the previous reading for the same car (ordered by refuelling event date/time), the server must notify the user and mark that reading as untrusted rather than silently accepting it as a normal trusted reading. Preserve the supplied value for correction/history; do not automatically rewrite it. The user may have entered a typo, the readings may be out of event order, or the odometer may have rolled over/reset. A lower reading must not automatically make later readings untrusted solely by cascade; reassess affected readings against their preceding event when records are added, edited, deleted, or reordered. Do not use untrusted readings to calculate distance-based consumption unless a defined method explicitly handles them. Purchase statistics remain available regardless of odometer trust.

Accurate distance-based fuel consumption (such as L/100 km) requires suitable odometer readings across refuelling events and a clearly defined calculation method; do not claim to calculate reliable consumption from purchase quantities alone.

## Initial technical direction

- PostgreSQL for persistent data.
- A lightweight TypeScript MCP server is a suitable implementation direction.
- Docker deployment is expected.
- ChatGPT/MCP is the initial user interface; a separate web UI is not required for the first release.
- **MVP:** Deploy with a configured bearer token mapped to one application user. Design the authentication boundary so handlers receive a server-established authenticated user context, allowing multi-user OAuth 2.0/OIDC to be added later without redesigning application logic or the data model. **Later phase:** Add OAuth 2.0/OIDC with an external identity provider; the MCP server will act as an OAuth resource server, not the identity provider.

## Decisions not yet specified

- MCP transport (for example, Streamable HTTP, STDIO or both).
- Exact bearer-token configuration and secret provisioning for the MVP.
- For the later multi-user phase: OIDC provider configuration, OAuth flow(s), identity claim mapping, and account provisioning/linking policy.
- Exact resource URI scheme and response schemas.
- Whether and how to retain a full before/after audit log for edits, in addition to soft deletion.
- Exact decimal precision and tolerance for comparing litres × unit price with total paid.
- Final statistics definitions and odometer-based consumption algorithm, including any explicit workflow for confirming or correcting an untrusted odometer reading.
