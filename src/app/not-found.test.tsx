// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "./not-found";

afterEach(cleanup);

describe("NotFound", () => {
  it("says what happened and is never a dead end", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Page not found");
    expect(screen.getByRole("link", { name: "Go to home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /Open emergency card/ }).getAttribute("href")).toBe("/emergency");
  });
});
