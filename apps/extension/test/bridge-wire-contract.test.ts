import { afterEach, describe, expect, test, vi } from "vitest";

import { bridgeClient } from "../src/background/bridge-client.js";
import {
  AUTH_HEADER as extensionAuthHeader,
  BRIDGE_DEFAULT_HOST as extensionBridgeDefaultHost,
  BRIDGE_DEFAULT_PORT as extensionBridgeDefaultPort,
  ENDPOINTS as extensionEndpoints,
  PROTOCOL_VERSION,
  type JobId,
} from "../src/contracts/bridge-wire.js";
import {
  AUTH_HEADER as sharedAuthHeader,
  BRIDGE_DEFAULT_HOST as sharedBridgeDefaultHost,
  BRIDGE_DEFAULT_PORT as sharedBridgeDefaultPort,
  ENDPOINTS as sharedEndpoints,
} from "@career-ops/shared";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension bridge wire contract", () => {
  test("uses the shared package as the single bridge wire source", () => {
    expect(extensionAuthHeader).toBe(sharedAuthHeader);
    expect(extensionBridgeDefaultHost).toBe(sharedBridgeDefaultHost);
    expect(extensionBridgeDefaultPort).toBe(sharedBridgeDefaultPort);
    expect(extensionEndpoints).toBe(sharedEndpoints);
    expect(Object.keys(extensionEndpoints).sort()).toEqual(Object.keys(sharedEndpoints).sort());
  });

  test("derives every extension bridge URL from the shared endpoint registry", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        const path = new URL(url).pathname;
        if (
          path === extensionEndpoints.NEWGRAD_ENRICH_STREAM.path ||
          path === "/v1/jobs/job-123/stream"
        ) {
          return new Response("data: {}\n\n", { status: 200 });
        }

        const requestId = typeof init?.body === "string"
          ? JSON.parse(init.body).requestId
          : "health";
        return new Response(
          JSON.stringify({
            ok: true,
            protocol: PROTOCOL_VERSION,
            requestId,
            serverTimestamp: "2026-04-28T00:00:00.000Z",
            result: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const client = bridgeClient({
      host: extensionBridgeDefaultHost,
      port: extensionBridgeDefaultPort,
      token: "test-token",
    });

    await client.getHealth();
    await client.checkLiveness("https://example.com/job");
    await client.createEvaluation({ url: "https://example.com/job" });
    await client.getJob("job-123" as JobId);
    await client.getTracker(10);
    await client.getReport(42);
    await client.mergeTracker(true);
    await client.getAutofillProfile();
    await client.getAutofillResume();
    await client.getNewGradPending(10);
    await client.backfillNewGradPendingCache([]);
    await client.scoreNewGradRows([]);
    await client.enrichNewGradRows([]);
    await client.streamEnrich([], () => undefined, new AbortController().signal);
    await client.streamJob("job-123" as JobId, () => undefined, new AbortController().signal);

    const paths = calls.map((url) => new URL(url).pathname);
    expect(paths).toEqual([
      extensionEndpoints.HEALTH.path,
      extensionEndpoints.LIVENESS.path,
      extensionEndpoints.EVALUATE_CREATE.path,
      "/v1/jobs/job-123",
      extensionEndpoints.TRACKER_LIST.path,
      "/v1/reports/42",
      extensionEndpoints.TRACKER_MERGE.path,
      extensionEndpoints.AUTOFILL_PROFILE.path,
      extensionEndpoints.AUTOFILL_RESUME.path,
      extensionEndpoints.NEWGRAD_PENDING.path,
      extensionEndpoints.NEWGRAD_PENDING_BACKFILL.path,
      extensionEndpoints.NEWGRAD_SCORE.path,
      extensionEndpoints.NEWGRAD_ENRICH.path,
      extensionEndpoints.NEWGRAD_ENRICH_STREAM.path,
      "/v1/jobs/job-123/stream",
    ]);
  });
});
