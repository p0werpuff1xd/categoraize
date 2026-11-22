import { describe, expect, it } from "vitest";
import {
  canRate,
  initialRating,
  type RatingState,
  ratingReducer,
} from "./rating-state";

const click = (accurate: boolean, online = true) =>
  ({ type: "click", accurate, online }) as const;

describe("C11 feedback buttons state machine", () => {
  it("C11-10 starts idle with the buttons shown", () => {
    expect(initialRating).toEqual({ status: "idle", rated: null });
    expect(canRate(initialRating)).toBe(true);
  });

  it("C11-11 idle -> saving shows the rating optimistically and hides the buttons", () => {
    const saving = ratingReducer(initialRating, click(true));
    expect(saving).toEqual({ status: "saving", rated: true });
    expect(canRate(saving)).toBe(false);
  });

  it("C11-12 saving -> saved on success", () => {
    const saved = ratingReducer(ratingReducer(initialRating, click(false)), {
      type: "success",
    });
    expect(saved).toEqual({ status: "saved", rated: false });
  });

  it("C11-13 saving -> error on failure brings the buttons back", () => {
    const failed = ratingReducer(ratingReducer(initialRating, click(true)), {
      type: "error",
    });
    expect(failed).toEqual({ status: "error", rated: null });
    expect(canRate(failed)).toBe(true);
  });

  it("C11-14 offline: nothing is sent and the buttons stay usable", () => {
    const offline = ratingReducer(initialRating, click(true, false));
    expect(offline).toEqual({ status: "offline", rated: null });
    expect(canRate(offline)).toBe(true);
  });

  it("C11-15 retry after error or offline goes back to saving", () => {
    const error: RatingState = { status: "error", rated: null };
    const offline: RatingState = { status: "offline", rated: null };
    expect(ratingReducer(error, click(true)).status).toBe("saving");
    expect(ratingReducer(offline, click(false)).status).toBe("saving");
  });

  it("C11-16 double clicks while saving or after saving are ignored", () => {
    const saving = ratingReducer(initialRating, click(true));
    expect(ratingReducer(saving, click(false))).toBe(saving);
    const saved = ratingReducer(saving, { type: "success" });
    expect(ratingReducer(saved, click(false))).toBe(saved);
  });

  it("C11-17 stray success or error outside saving changes nothing", () => {
    expect(ratingReducer(initialRating, { type: "success" })).toBe(
      initialRating,
    );
    expect(ratingReducer(initialRating, { type: "error" })).toBe(initialRating);
  });
});
