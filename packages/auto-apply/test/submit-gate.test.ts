import { describe, expect, it } from "vitest";

import {
  ashbyApplyFlow,
  greenhouseApplyFlow,
  leverApplyFlow,
  workdayApplyFlow,
  SubmitNotPermittedError,
} from "../src/index.js";

const flows = [
  ["greenhouse", greenhouseApplyFlow],
  ["lever", leverApplyFlow],
  ["ashby", ashbyApplyFlow],
  ["workday", workdayApplyFlow],
] as const;

const fakeTab = {} as Parameters<(typeof greenhouseApplyFlow)["submit"]>[0];

describe("ApplyFlow.submit gating — fill-only by default", () => {
  for (const [name, flow] of flows) {
    it(`${name}: throws SubmitNotPermittedError without opts`, async () => {
      await expect(flow.submit(fakeTab, {})).rejects.toBeInstanceOf(SubmitNotPermittedError);
    });

    it(`${name}: throws SubmitNotPermittedError with allowSubmit:false`, async () => {
      await expect(flow.submit(fakeTab, { allowSubmit: false })).rejects.toBeInstanceOf(
        SubmitNotPermittedError,
      );
    });

    it(`${name}: throws when allowSubmit is a truthy non-boolean (string)`, async () => {
      await expect(
        // Casting via never to force TypeScript to allow the wrong type — runtime gate must catch this.
        flow.submit(fakeTab, { allowSubmit: "true" as unknown as boolean }),
      ).rejects.toBeInstanceOf(SubmitNotPermittedError);
    });
  }
});
