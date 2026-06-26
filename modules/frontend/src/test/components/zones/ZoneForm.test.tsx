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
import { ZoneForm } from "../../../components/zones/ZoneForm";
import { renderWithProviders } from "../../utils/renderWithProviders";
import { buildGroup } from "../../fixtures/testData";
import type { Zone } from "../../../types/zone";

vi.mock("../../../services/groupsService", () => ({
  groupsService: {
    listEmailDomains: vi.fn(),
  },
}));

import { groupsService } from "../../../services/groupsService";
const mockService = groupsService as unknown as {
  listEmailDomains: ReturnType<typeof vi.fn>;
};

const groups = [
  buildGroup({ id: "g-1", name: "hobbits", description: "the shire" }),
  buildGroup({ id: "g-2", name: "elves", description: "rivendell" }),
];

function setup(overrides: Partial<Parameters<typeof ZoneForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <ZoneForm
      groups={groups}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={false}
      mode="create"
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockService.listEmailDomains.mockResolvedValue({ data: [] });
});

describe("<ZoneForm />", () => {
  it("renders the intro banner in create mode", () => {
    setup();
    expect(
      screen.getByText(/Use this form to connect to an already existing DNS zone/),
    ).toBeInTheDocument();
  });

  it("renders the required zone name and email fields", () => {
    setup();
    expect(
      screen.getByPlaceholderText("e.g. vinyldns.example.net."),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("zone-admin@example.com"),
    ).toBeInTheDocument();
  });

  it("disables the zone name field in edit mode", () => {
    setup({ mode: "edit", initialData: { name: "example.com." } });
    expect(
      screen.getByPlaceholderText("e.g. vinyldns.example.net."),
    ).toBeDisabled();
  });

  it("shows validation errors when required fields are empty", async () => {
    const { onSubmit } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /Connect Zone|Create|Save|Update/ }),
    );
    expect(await screen.findByText("Zone name is required")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Admin group is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the form once all required fields are valid", async () => {
    const { onSubmit } = setup();
    await userEvent.type(
      screen.getByPlaceholderText("e.g. vinyldns.example.net."),
      "vinyldns.example.net.",
    );
    await userEvent.type(
      screen.getByPlaceholderText("zone-admin@example.com"),
      "admin@example.com",
    );
    await userEvent.click(screen.getByText("— Select a group —"));
    await userEvent.click(screen.getByText("hobbits"));

    await userEvent.click(
      screen.getByRole("button", { name: /Connect Zone|Create|Save|Update/ }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "vinyldns.example.net.",
      email: "admin@example.com",
      adminGroupId: "g-1",
    });
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("toggles the valid email domains list when domains are available", async () => {
    mockService.listEmailDomains.mockResolvedValueOnce({
      data: ["example.com", "test.org"],
    });
    setup();

    const toggle = await screen.findByRole("button", {
      name: /Valid Email Domains/,
    });
    await userEvent.click(toggle);
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("test.org")).toBeInTheDocument();
  });

  it("expands the DNS server connection section", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: /DNS Server Connection/ });
    await userEvent.click(trigger);
    expect(screen.getByPlaceholderText("e.g. vinyldns.")).toBeInTheDocument();
  });
});
