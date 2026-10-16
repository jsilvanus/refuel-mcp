# Fuel Log MCP — Initial Specification

**Status:** Initial design decisions recorded; implementation details remain open.

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
- Optional odometer reading.
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

Odometer readings are optional in the initial schema. Accurate distance-based fuel consumption (such as L/100 km) requires suitable odometer readings across refuelling events and a clearly defined calculation method; do not claim to calculate reliable consumption from purchase quantities alone.

## Initial technical direction

- PostgreSQL for persistent data.
- A lightweight TypeScript MCP server is a suitable implementation direction.
- Docker deployment is expected.
- ChatGPT/MCP is the initial user interface; a separate web UI is not required for the first release.
- Keep transport and authentication implementation choices open until explicitly decided.

## Decisions not yet specified

- MCP transport (for example, Streamable HTTP, STDIO or both).
- Authentication provider and identity mapping.
- Exact resource URI scheme and response schemas.
- Whether and how to retain a full before/after audit log for edits, in addition to soft deletion.
- Exact decimal precision and tolerance for comparing litres × unit price with total paid.
- Final statistics definitions and odometer-based consumption algorithm.
