import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "./index.js";

describe("core", () => {
  it("exports a version string", () => {
    expect(typeof CORE_VERSION).toBe("string");
  });
});
