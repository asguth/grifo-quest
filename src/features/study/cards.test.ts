import { describe, expect, it } from "vitest";
import { intervalLabel } from "./cards";

describe("intervalLabel", () => {
  it("dias, meses e anos", () => {
    expect(intervalLabel(1)).toBe("1 d");
    expect(intervalLabel(29)).toBe("29 d");
    expect(intervalLabel(60)).toBe("2 m");
    expect(intervalLabel(365)).toBe("1 a");
    expect(intervalLabel(547)).toBe("1,5 a");
  });
});
