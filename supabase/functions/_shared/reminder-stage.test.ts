import { describe, expect, it } from "vitest";
import { reminderStage, type ReminderStage } from "./reminder-stage.ts";

const none: ReminderStage[] = [];

describe("reminderStage: the window for each reminder", () => {
  it.each([
    [31, null],
    [30, "30d"],
    [20, "30d"],
    [8, "30d"],
    [7, "7d"],
    [5, "7d"],
    [2, "7d"],
    [1, "1d"],
    [0, "today"],
    [-1, null],
    [-30, null],
  ] as const)("%i days left, nothing sent yet → %s", (daysLeft, expected) => {
    expect(reminderStage(daysLeft, none)).toBe(expected);
  });
});

describe("reminderStage: never the same reminder twice", () => {
  it("sends nothing when this window's reminder was already sent", () => {
    expect(reminderStage(29, ["30d"])).toBeNull();
    expect(reminderStage(6, ["30d", "7d"])).toBeNull();
    expect(reminderStage(1, ["1d"])).toBeNull();
    expect(reminderStage(0, ["30d", "7d", "1d", "today"])).toBeNull();
  });

  it("moves on to the next reminder once its window starts", () => {
    expect(reminderStage(7, ["30d"])).toBe("7d");
    expect(reminderStage(1, ["30d", "7d"])).toBe("1d");
    expect(reminderStage(0, ["30d", "7d", "1d"])).toBe("today");
  });
});

describe("reminderStage: catching up", () => {
  it("a medication added with 5 days left gets the 7-day reminder, not the 30-day one", () => {
    expect(reminderStage(5, none)).toBe("7d");
  });

  it("after a missed run, sends the reminder for the window it is in now", () => {
    expect(reminderStage(1, ["30d"])).toBe("1d"); // the 7-day run was missed
    expect(reminderStage(0, none)).toBe("today");
  });

  it("never goes back to an earlier reminder once a more urgent one was sent", () => {
    expect(reminderStage(10, ["7d"])).toBeNull();
    expect(reminderStage(5, ["1d"])).toBeNull();
    expect(reminderStage(1, ["today"])).toBeNull();
  });
});
