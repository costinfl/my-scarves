# my-scarves

Personal catalogue of football fan scarves for 1st and 2nd division clubs of all 55 UEFA associations.
Static site on GitHub Pages. Full plan: PLAN.md. Follow its phases in order.

## About me and how to work with me
- I'm an experienced Java developer. The TypeScript/Vite/GitHub Actions stack is a change from my usual
  work: skip basic programming explanations, and when you introduce a TS, Vite or Actions idiom, add a
  one-line Java analogy if it helps.
- I work in IntelliJ IDEA Ultimate and run you from its terminal. Every command must work there with only
  Node 22, npm and git. Pin the Node version (`.nvmrc` + `engines`), keep `.idea/` out of git, and
  expose everything through npm scripts so I can also run them as IDE run configurations.
- Be practical. Prefer the simplest thing that works over the clever thing. Add a dependency only when it
  clearly earns its place, and say what it replaces.
- If something I ask for doesn't fit a real constraint (Pages limits, API rate limits, repo size,
  my time, network limits), say so and propose the closest workable alternative before building. Don't
  silently comply and don't silently substitute.
- Plan briefly, then work in small steps. Show me results (coverage reports, diffs) before moving on.
- Code, commits and docs in English. Reply in the language I write to you in.

## Stack
Node 22, TypeScript, Vite (base path `/my-scarves/`), Leaflet, MiniSearch, sharp, vitest.
No backend, no database. Data is JSON in `data/`.

## Data rules
- Wikidata QID is the key for clubs, stadiums and leagues.
- `data/generated/` is owned by the pipeline and never edited by hand.
- `data/manual/` and `data/collection/` are mine. The pipeline must never write to them.
- Merge order at build time: generated, then manual overrides, then collection.
- An empty value from a source never erases an existing value.
- Do not invent facts about clubs. Only use data from Wikidata/Wikipedia. Blurbs start as `draft` and keep
  the Wikipedia source URL for attribution.
- League QIDs must be verified against Wikidata labels before importing. Never trust them from memory.

## Pipeline rules
- Scripts are idempotent, throttled, cached in the repo, and send a descriptive User-Agent.
- Nominatim: max 1 request/second. Respect robots.txt when looking for fan shops.
- Photos: resize to about 1600px JPEG plus a thumbnail before committing. Keep total photos under ~300 MB.
- Imports run in GitHub Actions and open a PR with the data diff. Never push generated data straight to main.

## Commands
- `npm run dev` runs the site locally
- `npm test` runs the tests
- `npm run import -- ROU ENG ESP` imports clubs and stadiums
- `npm run add-scarf` adds a scarf with its photo

## Done means
Tests pass, the build passes, and the Pages deploy works. Small commits per phase.