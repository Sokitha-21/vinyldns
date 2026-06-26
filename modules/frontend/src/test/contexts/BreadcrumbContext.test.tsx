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
import { describe, it, expect } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import {
  BreadcrumbProvider,
  useBreadcrumbs,
  type Crumb,
} from "../../contexts/BreadcrumbContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <BreadcrumbProvider>{children}</BreadcrumbProvider>;
}

describe("BreadcrumbContext", () => {
  describe("default value", () => {
    it("returns null crumbs and a no-op setter without a provider", () => {
      const { result } = renderHook(() => useBreadcrumbs());
      expect(result.current.crumbs).toBeNull();
      expect(() => result.current.setCrumbs([{ label: "x" }])).not.toThrow();
    });
  });

  describe("provider state", () => {
    it("starts with null crumbs", () => {
      const { result } = renderHook(() => useBreadcrumbs(), { wrapper });
      expect(result.current.crumbs).toBeNull();
    });

    it("stores crumbs passed to setCrumbs", () => {
      const { result } = renderHook(() => useBreadcrumbs(), { wrapper });
      const crumbs: Crumb[] = [{ label: "Home", to: "/" }, { label: "Zones" }];

      act(() => result.current.setCrumbs(crumbs));

      expect(result.current.crumbs).toEqual(crumbs);
    });

    it("resets crumbs back to null", () => {
      const { result } = renderHook(() => useBreadcrumbs(), { wrapper });

      act(() => result.current.setCrumbs([{ label: "A" }]));
      act(() => result.current.setCrumbs(null));

      expect(result.current.crumbs).toBeNull();
    });
  });

  describe("consumer integration", () => {
    it("reflects crumb changes in a consuming component", () => {
      function Consumer() {
        const { crumbs, setCrumbs } = useBreadcrumbs();
        return (
          <div>
            <button onClick={() => setCrumbs([{ label: "Groups" }])}>
              set
            </button>
            <span data-testid="label">{crumbs?.[0]?.label ?? "none"}</span>
          </div>
        );
      }

      render(
        <BreadcrumbProvider>
          <Consumer />
        </BreadcrumbProvider>,
      );

      expect(screen.getByTestId("label")).toHaveTextContent("none");
      act(() => screen.getByRole("button", { name: "set" }).click());
      expect(screen.getByTestId("label")).toHaveTextContent("Groups");
    });
  });
});
