# Adding a new site adapter to `@auto-job/browser`

This is the canonical guide for adding support for a new job site (or
any other site you want to scrape via the dedicated Chrome). The
framework is in `packages/browser/src/sites/`. Reference implementation:
`packages/browser/src/sites/greenhouse/`.

## Decide which shape your adapter is

Two shapes are supported:

| Shape | When to use | Example |
|---|---|---|
| **`SearchAdapter<TOptions, TResult>`** | Site exposes a list endpoint (HTTP API or HTML page) you can query with options like `{query, location, limit, page}`. Typical case. | builtin, indeed, jobright, greenhouse |
| **Caller-extractor wrapper** | The DOM extractor lives outside `packages/browser` (e.g. shared with a content script in `apps/extension`) and you want to avoid duplicating it. The adapter just navigates and `tab.evaluate()`s the caller-provided extractor. | linkedin |

99% of new sites should use `SearchAdapter`. The rest of this guide
assumes that shape.

## 4-step pattern

### 1. Create the adapter file

`packages/browser/src/sites/<id>/index.ts` — see `greenhouse/index.ts`
for a complete reference. The minimum surface:

```ts
import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface FooSearchOptions {
  query?: string;
  // ...
}

export interface FooJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  // ... any site-specific fields
}

export interface FooSearchResult {
  source: "foo";          // string-literal, identifies the adapter in output
  url: string;
  count: number;
  totalAvailable: number;
  jobs: FooJob[];
}

export async function searchFoo(
  tab: Tab,
  opts: FooSearchOptions,
): Promise<FooSearchResult> {
  // Navigate the tab to the site's domain if needed (for cookies/origin).
  // Skip if the API is open and CORS-friendly (e.g. Greenhouse).

  const r = await tab.fetch(buildUrl(opts), { json: true });
  if (!r.ok) {
    throw new AdapterParseError(`foo HTTP ${r.status}`, r.body);
  }

  // Parse, normalize, return.
  return { source: "foo", ... };
}

const META: SiteAdapterMeta = {
  id: "foo",
  name: "Foo Jobs",
  domain: "foo.com",
  requiresAuth: false,           // true if the user must log in via own-browser:login-helper
  description: "What Foo is and what kind of search the adapter supports.",
};

export const FOO_ADAPTER: SearchAdapter<FooSearchOptions, FooSearchResult> = {
  meta: META,
  search: searchFoo,
};
```

### 2. Register in the registry

Edit `packages/browser/src/sites/registry.ts`:

```ts
import { FOO_ADAPTER } from "./foo/index.js";

export const SITE_ADAPTERS = {
  builtin: BUILTIN_ADAPTER,
  indeed: INDEED_ADAPTER,
  jobright: JOBRIGHT_ADAPTER,
  greenhouse: GREENHOUSE_ADAPTER,
  foo: FOO_ADAPTER,            // <-- add here
} as const;
```

### 3. Re-export from the package root

Edit `packages/browser/src/index.ts`:

```ts
export { searchFoo, FOO_ADAPTER } from "./sites/foo/index.js";
export type {
  FooJob,
  FooSearchOptions,
  FooSearchResult,
} from "./sites/foo/index.js";
```

And `packages/browser/package.json` (the `exports` map):

```json
"./sites/foo": {
  "types": "./src/sites/foo/index.ts",
  "development": "./src/sites/foo/index.ts",
  "default": "./dist/sites/foo/index.js"
}
```

### 4. Write tests

`packages/browser/test/sites/foo.test.ts` — see `greenhouse.test.ts` for
the pattern. At minimum:

- Happy path: feed a synthetic API response into a `fakeTab` and assert
  the normalized output shape.
- Filter coverage: each `opts.*` filter has its own test.
- Error coverage: HTTP non-OK and malformed response both throw
  `AdapterParseError`.
- Registry presence: assert `FOO_ADAPTER.meta.id === "foo"` and
  `FOO_ADAPTER.search === searchFoo`.

The `registry.test.ts` will automatically pick up the new entry — its
"every adapter has matching meta" loop runs over all registered ids.

## How to wire it into a scan command

The framework gives you a typed adapter; consumers decide how to USE it.
Two common paths:

**Option A — Add a new `--source` value to `scripts/job-board-scan.ts`**

Best when the new site fits the existing scan-and-evaluate flow. Edit
`runSiteAdapter()` to switch on `options.source`:

```ts
} else if (options.source === "foo") {
  const r = await searchFoo(tab, { query: options.query, limit: adapterLimit(options) });
  return r as unknown as AdapterResult;
}
```

Then add an `npm run foo-scan` script entry pointing at
`job-board-scan.ts --source foo`.

**Option B — Write a dedicated scan script**

Best when the site has fundamentally different mechanics (e.g.
per-company instead of per-query, like Greenhouse). Copy the structure
of `scripts/job-board-scan.ts`, drop the `--source` switch, and call
the adapter directly.

Either way: the underlying `BrowserController` and dedicated profile
just work. No new infrastructure needed.

## Auth-required sites

If `requiresAuth: true`:

1. Add the site's login URL to `scripts/own-browser-login-helper.mjs`.
2. Document in your adapter's description that login is required.
3. Have the adapter throw `NotAuthenticatedError(siteName, loginUrl)`
   when it detects an auth wall (typical signals: response is 401, or
   200 with HTML containing a login form).

## Checklist

Before opening a PR adding a new site:

- [ ] Adapter file with `SearchAdapter<T, R>` typed export
- [ ] Registry entry
- [ ] Re-export from `src/index.ts` and `package.json` exports map
- [ ] Tests: happy path, filters, error paths, registry presence
- [ ] If `requiresAuth: true`: login helper updated
- [ ] Description in `SiteAdapterMeta` explains what the adapter does
- [ ] `npm --prefix packages/browser run typecheck` passes
- [ ] `npm --prefix packages/browser run test` passes
- [ ] `npm run verify` passes
