import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setTheme, useTheme } from "@/lib/theme";
import { ThemeRuntime } from "@/providers/ThemeRuntime";

function ThemeProbe() {
  const theme = useTheme();
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        Toggle
      </button>
    </div>
  );
}

describe("application theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to light with no saved preference, and a manual toggle persists it", () => {
    render(
      <>
        <ThemeRuntime />
        <ThemeProbe />
      </>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    act(() => screen.getByRole("button", { name: "Toggle" }).click());
    expect(localStorage.getItem("digi-pramaan-theme")).toBe("dark");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("applies a saved preference and updates when another tab changes it", () => {
    localStorage.setItem("digi-pramaan-theme", "dark");
    render(
      <>
        <ThemeRuntime />
        <ThemeProbe />
      </>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");

    act(() => {
      localStorage.setItem("digi-pramaan-theme", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "digi-pramaan-theme" }));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });
});
