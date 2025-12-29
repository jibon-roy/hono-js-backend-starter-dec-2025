## Setup

1. Install dependencies

```sh
bun install
```

2. Create your env file

- Copy `.env.example` to `.env`
- Set at minimum:
  - `DATABASE_URL`
  - `REDIS_HOST` / `REDIS_PORT` (Redis is required for queues)
  - `API_KEY`
  - `API_ACCESS_TOKEN` (optional; if omitted, it falls back to `API_KEY`)

3. Run the server

```sh
bun run dev
```

The server prints the final URL on startup (default is `http://localhost:5000`).

## Request headers (fully functional)

This API supports and uses these headers:

### `X-API-Key`

- Required on protected routes.
- Must match `API_KEY` from your `.env`.

### `X-API-Access-Token`

- Required on protected routes.
- Must match `API_ACCESS_TOKEN` from your `.env`.
- If `API_ACCESS_TOKEN` is not set, it will validate against `API_KEY` (backward compatible with older `.env` files).

### `X-Request-Id`

- Optional.
- If you send it, the server will use your value.
- If you don’t send it, the server generates one.
- The server always echoes it back in the response header as `X-Request-Id`.

## Examples

### Health check (public)

```sh
curl http://localhost:5000/api/v1/
```

### Call a protected endpoint

```sh
curl \
	-H "X-API-Key: <your API_KEY>" \
	-H "X-API-Access-Token: <your API_ACCESS_TOKEN or API_KEY>" \
	-H "X-Request-Id: local-dev-123" \
	http://localhost:5000/api/v1/users/all
```

### Bull Board (also protected)

Bull Board is mounted at:

`/api/v1/admin/queues`

Open it in the browser and include headers using a tool like Postman/Insomnia, or via a reverse proxy that injects headers.
