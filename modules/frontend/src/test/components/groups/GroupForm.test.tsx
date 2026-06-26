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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupForm } from "../../../components/groups/GroupForm";

function setup(overrides: Partial<Parameters<typeof GroupForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <GroupForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={false}
      mode="create"
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

describe("<GroupForm />", () => {
  it("renders empty fields in create mode", () => {
    setup();
    expect(screen.getByPlaceholderText("Enter group name")).toHaveValue("");
    expect(screen.getByPlaceholderText("group@example.com")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Create Group" }),
    ).toBeInTheDocument();
  });

  it("prefills fields from initialData in edit mode", () => {
    setup({
      mode: "edit",
      initialData: {
        name: "hobbits",
        email: "hobbits@example.com",
        description: "fellowship",
      },
    });
    expect(screen.getByPlaceholderText("Enter group name")).toHaveValue(
      "hobbits",
    );
    expect(screen.getByPlaceholderText("group@example.com")).toHaveValue(
      "hobbits@example.com",
    );
    expect(
      screen.getByRole("button", { name: "Update Group" }),
    ).toBeInTheDocument();
  });

  it("shows validation errors when required fields are empty", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Create Group" }));
    expect(
      await screen.findByText("Group name is required"),
    ).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the entered values when the form is valid", async () => {
    const { onSubmit } = setup();
    await userEvent.type(
      screen.getByPlaceholderText("Enter group name"),
      "hobbits",
    );
    await userEvent.type(
      screen.getByPlaceholderText("group@example.com"),
      "hobbits@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Group" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "hobbits",
      email: "hobbits@example.com",
    });
  });

  it("clears the fields when Clear is clicked in create mode", async () => {
    setup();
    const nameInput = screen.getByPlaceholderText("Enter group name");
    await userEvent.type(nameInput, "temp");
    await userEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(nameInput).toHaveValue("");
  });

  it("hides the Clear button in edit mode", () => {
    setup({ mode: "edit", initialData: { name: "hobbits" } });
    expect(
      screen.queryByRole("button", { name: /Clear/ }),
    ).not.toBeInTheDocument();
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables the submit button and shows a saving label while submitting", () => {
    setup({ isSubmitting: true });
    const submit = screen.getByRole("button", { name: /Saving/ });
    expect(submit).toBeDisabled();
  });
});
