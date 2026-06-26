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
import { screen } from "@testing-library/react";
import { AbandonedZonesTable } from "../../../components/zones/AbandonedZonesTable";
import { renderWithProviders } from "../../utils/renderWithProviders";
import { buildZone } from "../../fixtures/testData";
import type { DeletedZoneChange } from "../../../types/zone";

function deletedChange(overrides: Partial<DeletedZoneChange> = {}): DeletedZoneChange {
  return {
    zoneChange: {
      zone: buildZone({
        name: "old.example.com.",
        status: "Deleted",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-06-01T00:00:00Z",
      }),
      changeType: "Delete",
      status: "Synced",
      created: "2024-06-01T00:00:00Z",
      userId: "user-1",
      id: "change-1",
    },
    adminGroupName: "example-admins",
    userName: "fbaggins",
    accessLevel: "Delete",
    ...overrides,
  };
}

describe("<AbandonedZonesTable />", () => {
  it("renders the default empty state", () => {
    renderWithProviders(<AbandonedZonesTable zones={[]} />);
    expect(screen.getByText("No abandoned zones found")).toBeInTheDocument();
    expect(
      screen.getByText("Deleted zones will appear here."),
    ).toBeInTheDocument();
  });

  it("renders custom empty messaging", () => {
    renderWithProviders(
      <AbandonedZonesTable
        zones={[]}
        emptyMessage="Nothing abandoned"
        emptySubtitle="All clear"
      />,
    );
    expect(screen.getByText("Nothing abandoned")).toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
  });

  it("renders a row with zone name, email and abandoned-by user", () => {
    renderWithProviders(<AbandonedZonesTable zones={[deletedChange()]} />);
    expect(screen.getByText("old.example.com.")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("fbaggins")).toBeInTheDocument();
  });

  it("links the admin group when present", () => {
    renderWithProviders(<AbandonedZonesTable zones={[deletedChange()]} />);
    expect(
      screen.getByRole("link", { name: "example-admins" }),
    ).toBeInTheDocument();
  });

  it("falls back to the user id when no username is provided", () => {
    renderWithProviders(
      <AbandonedZonesTable
        zones={[deletedChange({ userName: undefined as unknown as string })]}
      />,
    );
    expect(screen.getByText("user-1")).toBeInTheDocument();
  });

  it("renders a shared access badge for shared zones", () => {
    const change = deletedChange();
    change.zoneChange.zone = buildZone({
      name: "old.example.com.",
      status: "Deleted",
      shared: true,
    });
    renderWithProviders(<AbandonedZonesTable zones={[change]} />);
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });
});
