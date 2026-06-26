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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonesPage } from "../../pages/ZonesPage";
import { renderWithProviders } from "../utils/renderWithProviders";
import { buildZone } from "../fixtures/testData";
import type { Zone } from "../../types/zone";

const zonesHook = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
const deletedHook = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
const profileHolder = vi.hoisted(() => ({
  current: {
    profile: { id: "user-1", isSuper: true } as Record<string, unknown> | null,
  },
}));

vi.mock("../../hooks/useZones", () => ({
  useZones: () => zonesHook.current,
  useDeletedZones: () => deletedHook.current,
}));

vi.mock("../../contexts/ProfileContext", () => ({
  useProfile: () => profileHolder.current,
}));

vi.mock("../../services/zonesService", () => ({
  zonesService: {
    getZones: vi.fn().mockResolvedValue({ data: { zones: [] } }),
    getDeletedZones: vi
      .fn()
      .mockResolvedValue({ data: { zonesDeletedInfo: [] } }),
    getBackendIds: vi.fn().mockResolvedValue({ data: ["default"] }),
    countZones: vi.fn().mockResolvedValue({
      data: { myZonesCount: 1, totalCount: 3, abandonedCount: 0 },
    }),
  },
}));

vi.mock("../../services/groupsService", () => ({
  groupsService: {
    getGroups: vi.fn().mockResolvedValue({ data: { groups: [] } }),
  },
}));

function baseZonesHook(overrides: Record<string, unknown> = {}) {
  return {
    zones: [
      buildZone({
        name: "alpha.example.com.",
        accessLevel: "Write",
      } as Partial<Zone>),
    ],
    isLoading: false,
    query: "",
    search: vi.fn(),
    accessFilter: undefined,
    setAccessFilter: vi.fn(),
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    nextPageEnabled: false,
    prevPageEnabled: false,
    pageNum: 0,
    paging: { next: undefined, pageNum: 0, startKeys: [], maxItems: 100 },
    getPanelTitle: () => "My Zones",
    resetPaging: vi.fn(),
    createZone: vi.fn(),
    updateZone: vi.fn(),
    deleteZone: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    ...overrides,
  };
}

function baseDeletedHook(overrides: Record<string, unknown> = {}) {
  return {
    deletedZones: [],
    isLoading: false,
    query: "",
    search: vi.fn(),
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    nextPageEnabled: false,
    prevPageEnabled: false,
    pageNum: 0,
    getPanelTitle: () => "Abandoned Zones",
    resetPaging: vi.fn(),
    setAccessFilter: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  zonesHook.current = baseZonesHook();
  deletedHook.current = baseDeletedHook();
  profileHolder.current = { profile: { id: "user-1", isSuper: true } };
});

describe("<ZonesPage />", () => {
  it("renders the page header", () => {
    renderWithProviders(<ZonesPage />);
    expect(screen.getByRole("heading", { name: "Zones" })).toBeInTheDocument();
  });

  it("renders the tab pills", () => {
    renderWithProviders(<ZonesPage />);
    expect(screen.getAllByText("My Zones").length).toBeGreaterThan(0);
    expect(screen.getAllByText("All Zones").length).toBeGreaterThan(0);
    expect(screen.getByText("Abandoned Zones")).toBeInTheDocument();
  });

  it("renders zone rows from the hook", () => {
    renderWithProviders(<ZonesPage />);
    expect(screen.getByText("alpha.example.com.")).toBeInTheDocument();
  });

  it("shows the Connect Zone button for super users", () => {
    renderWithProviders(<ZonesPage />);
    expect(
      screen.getByRole("button", { name: /Connect Zone/ }),
    ).toBeInTheDocument();
  });

  it("hides the Connect Zone button for non-super users", () => {
    profileHolder.current = { profile: { id: "user-1", isSuper: false } };
    renderWithProviders(<ZonesPage />);
    expect(
      screen.queryByRole("button", { name: /Connect Zone/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the connect zone modal", async () => {
    renderWithProviders(<ZonesPage />);
    await userEvent.click(screen.getByRole("button", { name: /Connect Zone/ }));
    await waitFor(() =>
      expect(screen.getByText("Connect to Zone")).toBeInTheDocument(),
    );
  });
});
