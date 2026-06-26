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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupMemberList } from "../../../components/groups/GroupMemberList";
import { buildGroupMember, frodoMember } from "../../fixtures/testData";

describe("<GroupMemberList />", () => {
  it("renders the empty state when there are no members", () => {
    render(<GroupMemberList members={[]} admins={[]} />);
    expect(screen.getByText("No members yet")).toBeInTheDocument();
  });

  it("renders a row per member with username, name and email", () => {
    render(<GroupMemberList members={[frodoMember]} admins={[frodoMember]} />);
    expect(screen.getByText("fbaggins")).toBeInTheDocument();
    expect(screen.getByText("Baggins, Frodo")).toBeInTheDocument();
    expect(screen.getByText("fbaggins@hobbitmail.me")).toBeInTheDocument();
  });

  it("renders an em dash when a member has no name parts", () => {
    const nameless = buildGroupMember({
      id: "m-1",
      userName: "ghost",
      firstName: "",
      lastName: "",
    });
    render(<GroupMemberList members={[nameless]} admins={[]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("sorts members alphabetically by username", () => {
    const a = buildGroupMember({ id: "m-a", userName: "aaron" });
    const z = buildGroupMember({ id: "m-z", userName: "zeb" });
    render(<GroupMemberList members={[z, a]} admins={[]} />);
    const cells = screen.getAllByText(/aaron|zeb/);
    expect(cells[0]).toHaveTextContent("aaron");
  });

  it("checks the manager switch for admin members", () => {
    render(<GroupMemberList members={[frodoMember]} admins={[frodoMember]} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("disables the manager switch when management is not allowed", () => {
    render(
      <GroupMemberList
        members={[frodoMember]}
        admins={[frodoMember]}
        canManage={false}
      />,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("invokes onToggleAdmin with the new state when the switch changes", async () => {
    const onToggleAdmin = vi.fn();
    const member = buildGroupMember({
      id: "m-1",
      userName: "sam",
      isAdmin: false,
    });
    render(
      <GroupMemberList
        members={[member]}
        admins={[]}
        canManage
        onToggleAdmin={onToggleAdmin}
      />,
    );

    await userEvent.click(screen.getByRole("switch"));
    expect(onToggleAdmin).toHaveBeenCalledWith("m-1", true);
  });

  it("renders the remove action only when management is allowed", async () => {
    const onRemove = vi.fn();
    const member = buildGroupMember({ id: "m-1", userName: "sam" });
    const { rerender } = render(
      <GroupMemberList members={[member]} admins={[]} />,
    );
    expect(screen.queryByTitle("Remove member")).not.toBeInTheDocument();

    rerender(
      <GroupMemberList
        members={[member]}
        admins={[]}
        canManage
        onRemove={onRemove}
      />,
    );
    await userEvent.click(screen.getByTitle("Remove member"));
    expect(onRemove).toHaveBeenCalledWith("m-1");
  });

  it("shows a spinner for the member currently being toggled", () => {
    const member = buildGroupMember({ id: "m-1", userName: "sam" });
    render(
      <GroupMemberList
        members={[member]}
        admins={[]}
        canManage
        isTogglingAdmin
        togglingMemberId="m-1"
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the lock status of a locked member", () => {
    const member = buildGroupMember({
      id: "m-1",
      userName: "sam",
      lockStatus: "Locked",
    });
    render(<GroupMemberList members={[member]} admins={[]} />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
