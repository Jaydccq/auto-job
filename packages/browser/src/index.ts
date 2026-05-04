/**
 * @auto-job/browser
 *
 * In-process CDP-attached browser automation library, replacing the
 * bb-browser PATH dependency for auto-job's scan flows. Phase 1 covers
 * the read path (scan); Phase 2 will add the write path (auto-apply)
 * under a separate OpenSpec change.
 *
 * Surface:
 *   BrowserController.ensure() → controller bound to dedicated Chrome
 *   controller.openTab(url)    → Tab
 *   tab.{navigate, evaluate, snapshot, click, fill, fetch, screenshot, waitForNetwork, close}
 *
 * Site adapters live under ./sites/{builtin,indeed,jobright,linkedin}.
 */

export { BrowserController } from "./browser-controller.js";
export { Tab } from "./tab.js";
export {
  ChromeNotFoundError,
  ProfileLockedError,
  NotAuthenticatedError,
  TabClosedError,
  AdapterParseError,
} from "./errors.js";
export type {
  AccessibilitySnapshot,
  ControllerOptions,
  FetchInit,
  FetchResult,
  NavigateOptions,
  NetworkRecord,
  RequestMatcher,
  ScreenshotOptions,
  TabInfo,
  WaitOptions,
} from "./types.js";

export { searchBuiltIn } from "./sites/builtin/index.js";
export type {
  BuiltInJob,
  BuiltInSearchOptions,
  BuiltInSearchResult,
} from "./sites/builtin/index.js";

export { searchIndeed } from "./sites/indeed/index.js";
export type {
  IndeedJob,
  IndeedSearchOptions,
  IndeedSearchResult,
} from "./sites/indeed/index.js";

export {
  recommendJobright,
  jobrightDetail,
  jobrightDismissPopups,
} from "./sites/jobright/index.js";
export type {
  JobrightJob,
  JobrightRecommendOptions,
  JobrightRecommendResult,
} from "./sites/jobright/index.js";

export {
  searchLinkedIn,
  linkedInJobDetail,
  detectLinkedInAuthBlock,
  captureLinkedInAuthState,
} from "./sites/linkedin/index.js";
export type { LinkedInAuthState } from "./sites/linkedin/index.js";

export { searchGreenhouse, GREENHOUSE_ADAPTER } from "./sites/greenhouse/index.js";
export type {
  GreenhouseJob,
  GreenhouseSearchOptions,
  GreenhouseSearchResult,
} from "./sites/greenhouse/index.js";

export {
  SITE_ADAPTERS,
  SITE_IDS,
  listSiteMetas,
  getSiteAdapter,
  isKnownSiteId,
} from "./sites/registry.js";
export type { SiteId } from "./sites/registry.js";
export type { SearchAdapter, SiteAdapterMeta } from "./sites/types.js";

export { BUILTIN_ADAPTER } from "./sites/builtin/index.js";
export { INDEED_ADAPTER } from "./sites/indeed/index.js";
export { JOBRIGHT_ADAPTER } from "./sites/jobright/index.js";
