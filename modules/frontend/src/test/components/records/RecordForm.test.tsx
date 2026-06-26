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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../../../components/records/RecordForm";
import { buildGroup, buildRecordSet } from "../../fixtures/testData";

function setup(overrides: Partial<Parameters<typeof RecordForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RecordForm
      zoneId="zone-id-1"
      zoneName="example.com."
      onSubmit={onSubmit}
      onCancel={onCancel}
      mode="create"
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<RecordForm />", () => {
  it("renders name, type, ttl fields and the create action", () => {
    setup();
    expect(screen.getByPlaceholderText("e.g. www")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("300")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Record/ }),
    ).toBeInTheDocument();
  });

  it("shows a validation error when the name is empty", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid A record", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByPlaceholderText("e.g. www"), "www");
    await userEvent.type(screen.getByPlaceholderText("192.168.1.1"), "10.0.0.1");
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      zoneId: "zone-id-1",
      name: "www",
      type: "A",
      ttl: 300,
      records: [{ address: "10.0.0.1" }],
    });
  });

  it("disables name and type fields in edit mode", () => {
    setup({
      mode: "edit",
      initialData: buildRecordSet({ name: "test", type: "A", ttl: 600 }),
    });
    expect(screen.getByDisplayValue("test")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save Changes/ })).toBeInTheDocument();
  });

  it("renders MX-specific fields after switching type", async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole("combobox"), "MX");
    expect(screen.getByPlaceholderText("mail.example.com.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Another/ }),
    ).toBeInTheDocument();
  });

  it("renders a textarea for PTR records", async () => {
    setup({ isReverseZone: true });
    expect(screen.getByText("FQDN (one per line)")).toBeInTheDocument();
  });

  it("renders a textarea for NS records", async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole("combobox"), "NS");
    expect(
      screen.getByText("NS Target FQDNs (one per line)"),
    ).toBeInTheDocument();
  });

  it("requires an owner group for shared zones", async () => {
    const { onSubmit } = setup({
      isSharedZone: true,
      allGroups: [buildGroup({ id: "g-1", name: "hobbits" })],
    });
    await userEvent.type(screen.getByPlaceholderText("e.g. www"), "www");
    await userEvent.type(screen.getByPlaceholderText("192.168.1.1"), "10.0.0.1");
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));

    expect(
      await screen.findByText("Owner Group is required for shared zones"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides the Clear button in edit mode", () => {
    setup({
      mode: "edit",
      initialData: buildRecordSet({ name: "test", type: "A" }),
    });
    expect(
      screen.queryByRole("button", { name: /^Clear$/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a loading label and disables submit while loading", () => {
    setup({ isLoading: true });
    const submit = screen.getByRole("button", { name: /Adding…/ });
    expect(submit).toBeDisabled();
  });
});
