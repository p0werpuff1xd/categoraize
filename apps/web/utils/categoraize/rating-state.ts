// State of the "Rate this priority" buttons. The rating is shown optimistically
// while saving; an error puts the buttons back; offline nothing is sent.

export type RatingStatus = "idle" | "saving" | "saved" | "error" | "offline";

export type RatingState = { status: RatingStatus; rated: boolean | null };

export type RatingEvent =
  | { type: "click"; accurate: boolean; online: boolean }
  | { type: "success" }
  | { type: "error" };

export const initialRating: RatingState = { status: "idle", rated: null };

export function ratingReducer(
  state: RatingState,
  event: RatingEvent,
): RatingState {
  switch (event.type) {
    case "click":
      if (state.status === "saving" || state.status === "saved") return state;
      return event.online
        ? { status: "saving", rated: event.accurate }
        : { status: "offline", rated: null };
    case "success":
      return state.status === "saving" ? { ...state, status: "saved" } : state;
    case "error":
      return state.status === "saving"
        ? { status: "error", rated: null }
        : state;
  }
}

/** Buttons are shown (and clickable) until a rating is being saved or saved. */
export function canRate(state: RatingState) {
  return state.rated === null;
}
