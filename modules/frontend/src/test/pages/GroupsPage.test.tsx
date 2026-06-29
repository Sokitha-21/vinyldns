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
import { GroupsPage } from "../../pages/GroupsPage";
import { renderWithProviders } from "../utils/renderWithProviders";
import { buildGroup } from "../fixtures/testData";

const hookState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("../../hooks/useGroups", () => ({
  useGroups: () => hookState.current,
}));

vi.mock("../../contexts/ProfileContext", () => ({
  useProfile: () => ({ profile: { id: "user-1", isSuper: false } }),
}));

vi.mock("../../services/groupsService", () => ({
  groupsService: {
    countGroups: vi.fn().mockResolvedValue({
      data: {
        myGroupCount: 2,
        totalCount: 5,
        adminGroupCount: 1,
        memberOnlyGroupCount: 1,
        noRoleGroupCount: 0,
        soleAdminGroupCount: 0,
      },
    }),
    getGroupsAbridged: vi.fn().mockResolvedValue({ data: { groups: [] } }),
  },
}));

function baseHook(overrides: Record<string, unknown> = {}) {
  return {
    groups: [buildGroup({ id: "g-1", name: "hobbits" })],
    isLoading: false,
    nextPage: vi.fn(),
    prevPage: vi.fn(),
    nextPageEnabled: false,
    prevPageEnabled: false,
    pageNum: 0,
    paging: { next: undefined, pageNum: 0, startKeys: [], maxItems: 100 },
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    resetPaging: vi.fn(),
    setRoleFilter: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.current = baseHook();
});

describe("<GroupsPage />", () => {
  it("renders the page header and primary actions", () => {
    renderWithProviders(<GroupsPage />);
    expect(screen.getByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /New Group/ }),
    ).toBeInTheDocument();
  });

  it("renders a loading spinner while groups load", () => {
    hookState.current = baseHook({ isLoading: true, groups: [] });
    const { container } = renderWithProviders(<GroupsPage />);
    expect(container.querySelector(".vds-loader-ring")).toBeInTheDocument();
  });

  it("renders the group rows from the hook", () => {
    renderWithProviders(<GroupsPage />);
    expect(screen.getByText("hobbits")).toBeInTheDocument();
  });

  it("opens the create group modal when New Group is clicked", async () => {
    renderWithProviders(<GroupsPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Group/ }));
    expect(await screen.findByText("Create New Group")).toBeInTheDocument();
  });

  it("renders the group search input", () => {
    renderWithProviders(<GroupsPage />);
    expect(
      screen.getByPlaceholderText("Search group by name"),
    ).toBeInTheDocument();
  });

  it("exposes My Groups and All Groups tabs", async () => {
    renderWithProviders(<GroupsPage />);
    await waitFor(() =>
      expect(screen.getByText("All Groups")).toBeInTheDocument(),
    );
    expect(screen.getByText("My Groups")).toBeInTheDocument();
  });
});
