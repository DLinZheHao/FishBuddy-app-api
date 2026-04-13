# Repository Guidelines

## Project Structure & Module Organization
The service is a small Node.js API using ES modules. Entry points live at the repository root: `server.js` starts the HTTP server and `app.js` wires Express middleware and routes. Route definitions are in `routes/weatherRoutes.js`, while request handlers and most domain logic live in `controllers/WeatherController.js`. Shared helpers belong in `utils/`, and static lookup data is stored in `Data/location.json`.

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm run dev` for local development with `nodemon`, and `npm start` to run the production-style server with Node. The current `npm test` script is a placeholder that exits with an error, so add a real test command before relying on it in CI.

## Coding Style & Naming Conventions
Follow the existing code style: ES module syntax, semicolon-terminated statements, and 4-space indentation in controllers and utilities. Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for dataset IDs and other constants, and PascalCase only for classes such as `LocationService`. Keep route files thin and place API normalization, scoring, and formatting logic in controllers or `utils/`.

## Testing Guidelines
There is no committed test framework yet. When adding tests, place them in a top-level `tests/` directory or next to the module as `*.test.js`, and cover route behavior plus CWA response normalization. Prefer lightweight integration tests against Express handlers and mock outbound CWA requests so tests stay deterministic.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries in Traditional Chinese, for example `新增運行指令` and `補上地點轉換檔案`. Keep commits focused on one change and use the same concise style. Pull requests should include: a brief description of behavior changes, any new environment variables or API datasets, sample request paths such as `/forecast/36-hour`, and response snippets when an endpoint contract changes.

## Security & Configuration Tips
Store secrets in `config.env` and load them through `dotenv`; do not commit API keys. `WeatherKEY` is required for CWA data requests. Review `nodemon.json` ignore rules before adding generated JSON or data files, and avoid checking in large temporary payloads from external APIs.
