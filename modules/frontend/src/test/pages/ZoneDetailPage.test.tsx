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
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { ZoneDetailPage } from "../../pages/ZoneDetailPage";
import { renderWithProviders } from "../utils/renderWithProviders";
import { buildZone, buildRecordSet } from "../fixtures/testData";

const recordsHook = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../hooks/useRecords", () => ({
  useZoneRecords: () => recordsHook.current,
}));

vi.mock("../../contexts/ProfileContext", () => ({
  useProfile: () => ({
    profile: { id: "user-1", isSuper: true },
    loading: false,
  }),
}));

vi.mock("../../services/zonesService", () => ({
  zonesService: {
    getZone: vi.fn(),
    getBackendIds: vi.fn().mockResolvedValue({ data: ["default"] }),
    getZoneChanges: vi.fn().mockResolvedValue({ data: { zoneChanges: [] } }),
    syncZone: vi.fn(),
    updateZone: vi.fn(),
    deleteZone: vi.fn(),
    normalizeZoneDates: vi.fn((z) => z),
  },
}));

vi.mock("../../services/groupsService", () => ({
  groupsService: {
    getGroups: vi.fn().mockResolvedValue({ data: { groups: [] } }),
    getGroup: vi.fn().mockResolvedValue({ data: { members: [] } }),
  },
}));

vi.mock("../../services/recordsService", () => ({
  recordsService: {
    getRecordSetChanges: vi
      .fn()
      .mockResolvedValue({ data: { recordSetChanges: [] } }),
    updateRecordSet: vi.fn(),
  },
}));

vi.mock("../../services/profileService", () => ({
  profileService: { getUserDataByUsername: vi.fn() },
}));

vi.mock("../../services/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { userName: "user" } }) },
}));

import { zonesService } from "../../services/zonesService";
const mockZones = zonesService as unknown as {
  getZone: ReturnType<typeof vi.fn>;
};

function baseRecordsHook(overrides: Record<string, unknown> = {}) {
  return {
    records: [buildRecordSet({ name: "www", type: "A" })],
    isLoading: false,
    search: vi.fn(),
    refetch: vi.fn(),
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    nextPageEnabled: false,
    prevPageEnabled: false,
    getPanelTitle: () => "Records",
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    isCreatePending: false,
    isUpdatePending: false,
    isDeletePending: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordsHook.current = baseRecordsHook();
  mockZones.getZone.mockResolvedValue({
    data: { zone: buildZone({ id: "zone-id-1", name: "example.com." }) },
  });
});

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/zones/:id" element={<ZoneDetailPage />} />
    </Routes>,
    { routerEntries: ["/zones/zone-id-1"] },
  );
}

describe("<ZoneDetailPage />", () => {
  it("shows a loading spinner before the zone resolves", () => {
    const { container } = renderPage();
    expect(container.querySelector(".vds-loader-ring")).toBeInTheDocument();
  });

  it("renders the zone name once loaded", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "example.com." }),
    ).toBeInTheDocument();
  });

  it("renders the detail tabs", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "example.com." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manage Records")).toBeInTheDocument();
    expect(screen.getByText("Record Changes")).toBeInTheDocument();
    expect(screen.getByText("Zone Changes")).toBeInTheDocument();
    expect(screen.getByText("Manage Zone")).toBeInTheDocument();
  });

  it("renders record rows from the hook", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "example.com." }),
    ).toBeInTheDocument();
    expect(screen.getByText("www")).toBeInTheDocument();
  });

  it("renders a not-found message when the zone is missing", async () => {
    mockZones.getZone.mockResolvedValue({ data: { zone: null } });
    renderPage();
    expect(await screen.findByText("Zone not found.")).toBeInTheDocument();
  });
});
