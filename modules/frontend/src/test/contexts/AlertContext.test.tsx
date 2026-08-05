/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertProvider, useAlerts } from "../../contexts/AlertContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AlertProvider>{children}</AlertProvider>;
}

describe("AlertContext", () => {
  describe("useAlerts outside a provider", () => {
    it("throws a descriptive error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => renderHook(() => useAlerts())).toThrow(
        "useAlerts must be used inside AlertProvider",
      );
      spy.mockRestore();
    });
  });

  describe("default state", () => {
    it("starts with no alerts", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });
      expect(result.current.alerts).toEqual([]);
    });
  });

  describe("addAlert", () => {
    it("appends an alert with a generated id, type and content", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("danger", "Boom"));

      expect(result.current.alerts).toHaveLength(1);
      expect(result.current.alerts[0]).toMatchObject({
        type: "danger",
        content: "Boom",
      });
      expect(result.current.alerts[0].id).toBeTruthy();
    });

    it("keeps multiple alerts in insertion order", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("info", "first"));
      act(() => result.current.addAlert("warning", "second"));

      expect(result.current.alerts.map((a) => a.content)).toEqual([
        "first",
        "second",
      ]);
    });
  });

  describe("auto-dismiss", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("removes a success alert after five seconds", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("success", "Saved"));
      expect(result.current.alerts).toHaveLength(1);

      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.alerts).toHaveLength(0);
    });

    it("does not auto-dismiss non-success alerts", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("danger", "Stay"));
      act(() => vi.advanceTimersByTime(5000));

      expect(result.current.alerts).toHaveLength(1);
    });
  });

  describe("removeAlert", () => {
    it("removes only the alert with the matching id", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("info", "keep"));
      act(() => result.current.addAlert("info", "drop"));
      const dropId = result.current.alerts[1].id;

      act(() => result.current.removeAlert(dropId));

      expect(result.current.alerts).toHaveLength(1);
      expect(result.current.alerts[0].content).toBe("keep");
    });

    it("is a no-op for an unknown id", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("info", "keep"));
      act(() => result.current.removeAlert("missing"));

      expect(result.current.alerts).toHaveLength(1);
    });
  });

  describe("clearAlerts", () => {
    it("empties the alert list", () => {
      const { result } = renderHook(() => useAlerts(), { wrapper });

      act(() => result.current.addAlert("info", "a"));
      act(() => result.current.addAlert("info", "b"));
      act(() => result.current.clearAlerts());

      expect(result.current.alerts).toEqual([]);
    });
  });

  describe("consumer integration", () => {
    it("exposes context values to a consuming component", async () => {
      function Consumer() {
        const { alerts, addAlert } = useAlerts();
        return (
          <div>
            <button onClick={() => addAlert("info", "hello")}>add</button>
            <span data-testid="count">{alerts.length}</span>
          </div>
        );
      }

      render(
        <AlertProvider>
          <Consumer />
        </AlertProvider>,
      );

      expect(screen.getByTestId("count")).toHaveTextContent("0");
      await userEvent.click(screen.getByRole("button", { name: "add" }));
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
  });
});
