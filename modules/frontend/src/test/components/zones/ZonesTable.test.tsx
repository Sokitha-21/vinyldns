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
import userEvent from "@testing-library/user-event";
import { ZonesTable } from "../../../components/zones/ZonesTable";
import { renderWithProviders } from "../../utils/renderWithProviders";
import { buildZone } from "../../fixtures/testData";
import type { Zone } from "../../../types/zone";

describe("<ZonesTable />", () => {
  it("renders the default empty state", () => {
    renderWithProviders(<ZonesTable zones={[]} />);
    expect(screen.getByText("No zones found")).toBeInTheDocument();
    expect(
      screen.getByText(/You do not own any zones/),
    ).toBeInTheDocument();
  });

  it("renders the all-zones empty subtitle when showAllZones is set", () => {
    renderWithProviders(<ZonesTable zones={[]} showAllZones />);
    expect(
      screen.getByText("No zones match the search criteria."),
    ).toBeInTheDocument();
  });

  it("renders custom empty messaging", () => {
    renderWithProviders(
      <ZonesTable zones={[]} emptyMessage="Empty" emptySubtitle="None" />,
    );
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("links the zone name when the user has access", () => {
    renderWithProviders(
      <ZonesTable zones={[buildZone({ accessLevel: "Write" } as Partial<Zone>)]} />,
    );
    expect(
      screen.getByRole("link", { name: "example.com." }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("View zone")).toBeInTheDocument();
  });

  it("renders the zone name as plain text without access", () => {
    renderWithProviders(
      <ZonesTable zones={[buildZone({ accessLevel: "NoAccess" } as Partial<Zone>)]} />,
    );
    expect(
      screen.queryByRole("link", { name: "example.com." }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("example.com.")).toBeInTheDocument();
  });

  it("shows a Shared access badge for shared zones", () => {
    renderWithProviders(
      <ZonesTable zones={[buildZone({ shared: true })]} />,
    );
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("shows a Private access badge for non-shared zones", () => {
    renderWithProviders(<ZonesTable zones={[buildZone({ shared: false })]} />);
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("renders an em dash when there is no latest sync", () => {
    renderWithProviders(
      <ZonesTable zones={[buildZone({ latestSync: undefined })]} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("links the admin group when an id is present", () => {
    renderWithProviders(<ZonesTable zones={[buildZone()]} />);
    expect(
      screen.getByRole("link", { name: "example-admins" }),
    ).toBeInTheDocument();
  });

  it("sorts zones by name when the header is toggled", async () => {
    renderWithProviders(
      <ZonesTable
        zones={[
          buildZone({ id: "z-b", name: "bravo.com.", accessLevel: "Write" } as Partial<Zone>),
          buildZone({ id: "z-a", name: "alpha.com.", accessLevel: "Write" } as Partial<Zone>),
        ]}
      />,
    );

    await userEvent.click(screen.getByText(/Zone Name/));
    const links = screen.getAllByRole("link", { name: /alpha.com.|bravo.com./ });
    expect(links[0]).toHaveTextContent("alpha.com.");
  });
});
