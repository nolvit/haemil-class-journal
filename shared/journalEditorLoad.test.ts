import { describe, expect, it } from "vitest";
import { journalEditorLoadState } from "./journalEditorLoad";

describe("journal editor loading", () => {
  it("opens a cached row immediately even while refreshing", () => {
    expect(journalEditorLoadState(true, true, { isError: false, isSuccess: true, isFetching: true }))
      .toEqual({ loadError: false, isLoadingDate: false });
  });

  it("does not show the previous date while the requested row is missing", () => {
    expect(journalEditorLoadState(true, false, { isError: false, isSuccess: false, isFetching: true }))
      .toEqual({ loadError: false, isLoadingDate: true });
  });

  it("reports a failed or missing requested row", () => {
    expect(journalEditorLoadState(true, false, { isError: true, isSuccess: false, isFetching: false }).loadError).toBe(true);
    expect(journalEditorLoadState(true, false, { isError: false, isSuccess: true, isFetching: false }).loadError).toBe(true);
  });
});
