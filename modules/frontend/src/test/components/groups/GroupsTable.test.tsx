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
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupsTable } from "../../../components/groups/GroupsTable";
import { renderWithProviders } from "../../utils/renderWithProviders";
import { buildGroup, frodoMember } from "../../fixtures/testData";
import type { Group } from "../../../types/group";

function setup(groups: Group[], overrides: Partial<Parameters<typeof GroupsTable>[0]> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const isGroupAdmin = overrides.isGroupAdmin ?? (() => true);
  renderWithProviders(
    <GroupsTable
      groups={groups}
      onEdit={onEdit}
      onDelete={onDelete}
      isDeleting={false}
      isGroupAdmin={isGroupAdmin}
      {...overrides}
    />,
  );
  return { onEdit, onDelete };
}

describe("<GroupsTable />", () => {
  it("renders the empty state with the default message", () => {
    setup([]);
    expect(screen.getByText("No groups found")).toBeInTheDocument();
    expect(
      screen.getByText("Create a group to get started."),
    ).toBeInTheDocument();
  });

  it("renders custom empty messaging when provided", () => {
    setup([], {
      emptyMessage: "Nothing here",
      emptySubtitle: "Try a different filter",
    });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try a different filter")).toBeInTheDocument();
  });

  it("renders a row per group with name and email", () => {
    setup([buildGroup()]);
    expect(screen.getByRole("link", { name: "hobbits" })).toBeInTheDocument();
    expect(screen.getByText("hobbits@hobbitmail.me")).toBeInTheDocument();
  });

  it("falls back to a placeholder when description is blank", () => {
    setup([buildGroup({ description: "   " })]);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows an Admin role badge for the current admin user", () => {
    setup([buildGroup({ admins: [frodoMember], members: [frodoMember] })], {
      currentUserId: frodoMember.id,
    });
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows a Member role badge for a non-admin member", () => {
    setup([buildGroup({ admins: [], members: [frodoMember] })], {
      currentUserId: frodoMember.id,
    });
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("shows a No Role badge when the user is neither admin nor member", () => {
    setup([buildGroup({ admins: [], members: [] })], {
      currentUserId: "stranger",
    });
    expect(screen.getByText("No Role")).toBeInTheDocument();
  });

  it("invokes onEdit when the edit button is clicked", async () => {
    const group = buildGroup();
    const { onEdit } = setup([group]);
    await userEvent.click(screen.getByTitle("Edit group"));
    expect(onEdit).toHaveBeenCalledWith(group);
  });

  it("invokes onDelete when the delete button is clicked", async () => {
    const group = buildGroup();
    const { onDelete } = setup([group]);
    await userEvent.click(screen.getByTitle("Delete group"));
    expect(onDelete).toHaveBeenCalledWith(group);
  });

  it("hides edit and delete actions when the user is not a group admin", () => {
    setup([buildGroup()], { isGroupAdmin: () => false });
    expect(screen.queryByTitle("Edit group")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete group")).not.toBeInTheDocument();
    expect(screen.getByTitle("View group")).toBeInTheDocument();
  });

  it("disables the delete button while a deletion is in progress", () => {
    setup([buildGroup()], { isDeleting: true });
    expect(screen.getByTitle("Delete group")).toBeDisabled();
  });

  it("sorts groups by name when the header is toggled", async () => {
    setup([
      buildGroup({ id: "g-b", name: "bravo" }),
      buildGroup({ id: "g-a", name: "alpha" }),
    ]);

    await userEvent.click(screen.getByText(/Group Name/));
    const links = screen.getAllByRole("link", { name: /alpha|bravo/ });
    expect(links[0]).toHaveTextContent("alpha");

    await userEvent.click(screen.getByText(/Group Name/));
    const linksDesc = screen.getAllByRole("link", { name: /alpha|bravo/ });
    expect(linksDesc[0]).toHaveTextContent("bravo");
  });
});
