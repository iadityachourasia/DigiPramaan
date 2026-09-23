import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  let systemDark = false;
  let systemChange: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    systemDark = false;
    systemChange = undefined;
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_event: string, listener: () => void) => {
        systemChange = listener;
      },
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with the system preference and follows changes until a choice is saved", () => {
    systemDark = true;
    render(
      <>
        <ThemeRuntime />
        <ThemeProbe />
      </>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    act(() => {
      systemDark = false;
      systemChange?.();
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    act(() => screen.getByRole("button", { name: "Toggle" }).click());
    expect(localStorage.getItem("digi-pramaan-theme")).toBe("dark");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");

    act(() => {
      systemDark = true;
      systemChange?.();
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("applies a saved preference and updates when another tab changes it", () => {
    localStorage.setItem("digi-pramaan-theme", "light");
    systemDark = true;
    render(
      <>
        <ThemeRuntime />
        <ThemeProbe />
      </>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    act(() => {
      localStorage.setItem("digi-pramaan-theme", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "digi-pramaan-theme" }));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });
});
