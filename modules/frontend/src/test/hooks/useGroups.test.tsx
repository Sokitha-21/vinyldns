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
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGroups } from "../../hooks/useGroups";
import { hobbitGroup } from "../fixtures/testData";

const mockAddAlert = vi.fn();

vi.mock("../../contexts/AlertContext", () => ({
  useAlerts: vi.fn(() => ({
    alerts: [],
    addAlert: mockAddAlert,
    removeAlert: vi.fn(),
    clearAlerts: vi.fn(),
  })),
}));

vi.mock("../../services/groupsService", () => ({
  groupsService: {
    getGroupsAbridged: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}));

import { groupsService } from "../../services/groupsService";
const mockService = groupsService as unknown as {
  getGroupsAbridged: ReturnType<typeof vi.fn>;
  createGroup: ReturnType<typeof vi.fn>;
  updateGroup: ReturnType<typeof vi.fn>;
  deleteGroup: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockService.getGroupsAbridged.mockResolvedValue({
    data: { groups: [], nextId: undefined },
  });
});

describe("useGroups", () => {
  describe("initial state", () => {
    it("returns an empty list before data loads", () => {
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });
      expect(result.current.groups).toEqual([]);
    });

    it("populates groups after a successful fetch", async () => {
      mockService.getGroupsAbridged.mockResolvedValueOnce({
        data: { groups: [hobbitGroup], nextId: "next-1" },
      });
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });
      await waitFor(() => expect(result.current.groups).toHaveLength(1));
      expect(result.current.groups[0].name).toBe("hobbits");
      expect(result.current.nextPageEnabled).toBe(true);
    });
  });

  describe("createGroup", () => {
    it("alerts success on create", async () => {
      mockService.createGroup.mockResolvedValueOnce({ data: hobbitGroup });
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });

      act(() => result.current.createGroup({ name: "hobbits" }));

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith(
          "success",
          "Group created successfully",
        ),
      );
    });

    it("alerts a parsed server error on failure", async () => {
      mockService.createGroup.mockRejectedValueOnce({
        response: { status: 409, statusText: "Conflict", data: { errors: ["exists"] } },
      });
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });

      act(() => result.current.createGroup({ name: "hobbits" }));

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith(
          "danger",
          expect.stringContaining("HTTP 409 (Conflict)"),
        ),
      );
    });
  });

  describe("updateGroup", () => {
    it("alerts success on update", async () => {
      mockService.updateGroup.mockResolvedValueOnce({ data: hobbitGroup });
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });

      act(() =>
        result.current.updateGroup({
          id: "group-id-1",
          group: { email: "new@example.com" },
        }),
      );

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith(
          "success",
          "Group updated successfully",
        ),
      );
    });
  });

  describe("deleteGroup", () => {
    it("alerts success on delete", async () => {
      mockService.deleteGroup.mockResolvedValueOnce({});
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });

      act(() => result.current.deleteGroup("group-id-1"));

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith(
          "success",
          "Group deleted successfully",
        ),
      );
    });

    it("alerts a string server error on failure", async () => {
      mockService.deleteGroup.mockRejectedValueOnce({
        response: { status: 400, statusText: "Bad Request", data: '"group in use"' },
      });
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });

      act(() => result.current.deleteGroup("group-id-1"));

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith(
          "danger",
          expect.stringContaining("group in use"),
        ),
      );
    });
  });

  describe("setRoleFilter", () => {
    it("updates the active role filter", async () => {
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.setRoleFilter(1));

      await waitFor(() => expect(result.current.roleFilter).toBe(1));
    });

    it("ignores a repeated identical filter value", async () => {
      const { result } = renderHook(() => useGroups(), {
        wrapper: makeWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.setRoleFilter(1));
      await waitFor(() => expect(result.current.roleFilter).toBe(1));
      mockService.getGroupsAbridged.mockClear();

      act(() => result.current.setRoleFilter(1));
      expect(mockService.getGroupsAbridged).not.toHaveBeenCalled();
    });
  });
});
