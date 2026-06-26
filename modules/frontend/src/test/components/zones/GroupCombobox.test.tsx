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
import { GroupCombobox } from "../../../components/zones/GroupCombobox";
import { buildGroup } from "../../fixtures/testData";

const groups = [
  buildGroup({ id: "g-1", name: "hobbits", description: "the shire" }),
  buildGroup({ id: "g-2", name: "elves", description: "rivendell" }),
  buildGroup({ id: "g-3", name: "dwarves", description: "" }),
];

function setup(value = "") {
  const onChange = vi.fn();
  render(<GroupCombobox groups={groups} value={value} onChange={onChange} />);
  return { onChange };
}

describe("<GroupCombobox />", () => {
  it("shows a placeholder when nothing is selected", () => {
    setup();
    expect(screen.getByText("— Select a group —")).toBeInTheDocument();
  });

  it("shows the selected group name and description", () => {
    setup("g-1");
    expect(screen.getByText("hobbits")).toBeInTheDocument();
    expect(screen.getByText("(the shire)")).toBeInTheDocument();
  });

  it("opens the dropdown and lists all groups", async () => {
    setup();
    await userEvent.click(screen.getByText("— Select a group —"));
    expect(screen.getByText("elves")).toBeInTheDocument();
    expect(screen.getByText("dwarves")).toBeInTheDocument();
  });

  it("filters the group list by the search term", async () => {
    setup();
    await userEvent.click(screen.getByText("— Select a group —"));
    await userEvent.type(
      screen.getByPlaceholderText("Type to filter groups…"),
      "elv",
    );
    expect(screen.getByText("elves")).toBeInTheDocument();
    expect(screen.queryByText("hobbits")).not.toBeInTheDocument();
  });

  it("shows a no-match message when the filter excludes everything", async () => {
    setup();
    await userEvent.click(screen.getByText("— Select a group —"));
    await userEvent.type(
      screen.getByPlaceholderText("Type to filter groups…"),
      "zzz",
    );
    expect(screen.getByText("No groups match")).toBeInTheDocument();
  });

  it("invokes onChange with the chosen group id", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("— Select a group —"));
    await userEvent.click(screen.getByText("elves"));
    expect(onChange).toHaveBeenCalledWith("g-2");
  });

  it("clears the selection when the placeholder option is chosen", async () => {
    const { onChange } = setup("g-1");
    await userEvent.click(screen.getByText("hobbits"));
    const options = screen.getAllByText("— Select a group —");
    await userEvent.click(options[options.length - 1]);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("renders an error message when invalid", () => {
    render(
      <GroupCombobox
        groups={groups}
        value=""
        onChange={vi.fn()}
        invalid
        errorMessage="Admin group is required"
      />,
    );
    expect(screen.getByText("Admin group is required")).toBeInTheDocument();
  });
});
