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

import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom doesn't implement window.matchMedia; provide a deterministic stub
// so components that probe for dark theme (e.g. tables, modals) don't throw.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom's clipboard API stub — many tables call navigator.clipboard.writeText
// when the user clicks a "copy" button.
if (!("clipboard" in navigator)) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

// IntersectionObserver / ResizeObserver are referenced indirectly by some
// Bootstrap/React components; provide no-op shims so module init never throws.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!(globalThis as any).IntersectionObserver) {
  (globalThis as any).IntersectionObserver = NoopObserver;
}
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = NoopObserver;
}
