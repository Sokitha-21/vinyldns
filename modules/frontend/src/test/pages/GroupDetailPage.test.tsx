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
import { Routes, Route } from "react-router-dom";
import { GroupDetailPage } from "../../pages/GroupDetailPage";
import { renderWithProviders } from "../utils/renderWithProviders";
import { buildGroup, frodoMember } from "../fixtures/testData";

vi.mock("../../contexts/ProfileContext", () => ({
  useProfile: () => ({
    profile: { id: "frodo-uuid", isSuper: true },
    loading: false,
  }),
}));

vi.mock("../../services/groupsService", () => ({
  groupsService: {
    getGroup: vi.fn(),
    getGroupMemberList: vi.fn(),
    updateGroup: vi.fn(),
    getGroupChanges: vi.fn().mockResolvedValue({ data: { changes: [] } }),
  },
}));

vi.mock("../../services/profileService", () => ({
  profileService: {
    getUserDataByUsername: vi.fn(),
  },
}));

import { groupsService } from "../../services/groupsService";
const mockGroups = groupsService as unknown as {
  getGroup: ReturnType<typeof vi.fn>;
  getGroupMemberList: ReturnType<typeof vi.fn>;
  getGroupChanges: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGroups.getGroup.mockResolvedValue({
    data: buildGroup({ id: "g-1", name: "hobbits" }),
  });
  mockGroups.getGroupMemberList.mockResolvedValue({
    data: { members: [frodoMember] },
  });
  mockGroups.getGroupChanges = vi
    .fn()
    .mockResolvedValue({ data: { changes: [] } });
});

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/groups/:id" element={<GroupDetailPage />} />
    </Routes>,
    { routerEntries: ["/groups/g-1"] },
  );
}

describe("<GroupDetailPage />", () => {
  it("shows a loading spinner before the group resolves", () => {
    const { container } = renderPage();
    expect(container.querySelector(".vds-loader-ring")).toBeInTheDocument();
  });

  it("renders the group name once loaded", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "hobbits" }),
    ).toBeInTheDocument();
  });

  it("renders the manage members tab and member rows", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "hobbits" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Manage Members/)).toBeInTheDocument();
    expect(screen.getByText("fbaggins")).toBeInTheDocument();
  });

  it("renders a not-found message when the group is missing", async () => {
    mockGroups.getGroup.mockResolvedValue({ data: null });
    renderPage();
    expect(await screen.findByText("Group not found.")).toBeInTheDocument();
  });

  it("toggles the add member form", async () => {
    renderPage();
    const addBtn = await screen.findByRole("button", { name: /Add Member/ });
    await userEvent.click(addBtn);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Cancel/ }),
      ).toBeInTheDocument(),
    );
  });
});
