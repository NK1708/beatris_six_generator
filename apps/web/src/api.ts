import type {
  AvailableFrameTargetStoryStateResponse,
  FrameTargetRecoveryCandidatesResponse,
  FrameTargetRecoveryRequest,
  FrameTargetStoryStateResponse,
  UpdateFrameTargetStoryStateInput
} from "@bearridge/shared";

export const api = {
  async get<T>(url: string): Promise<T> {
    return parseResponse<T>(await fetch(url));
  },
  async post<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  },
  async put<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  },
  async delete<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  },
  async getFrameTargetStoryState(frameId: string): Promise<FrameTargetStoryStateResponse> {
    return api.get(`/api/frames/${encodeURIComponent(frameId)}/target-story-state`);
  },
  async initializeFrameTargetStoryState(frameId: string): Promise<AvailableFrameTargetStoryStateResponse> {
    return api.post(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/initialize`, {});
  },
  async updateFrameTargetStoryState(
    frameId: string,
    input: UpdateFrameTargetStoryStateInput
  ): Promise<AvailableFrameTargetStoryStateResponse> {
    return api.put(`/api/frames/${encodeURIComponent(frameId)}/target-story-state`, input);
  },
  async getFrameTargetRecoveryCandidates(frameId: string): Promise<FrameTargetRecoveryCandidatesResponse> {
    return api.get(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/recovery-candidates`);
  },
  async recoverFrameTargetStoryState(
    frameId: string,
    input: FrameTargetRecoveryRequest
  ): Promise<AvailableFrameTargetStoryStateResponse> {
    return api.post(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/recover`, input);
  }
};

export class ApiError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number, readonly diagnostics: string[] = []) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Запрос не выполнен";
    const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : null;
    const diagnostics = typeof data === "object" && data !== null && "diagnostics" in data && Array.isArray(data.diagnostics)
      ? data.diagnostics.filter((item): item is string => typeof item === "string")
      : [];
    throw new ApiError(message, code, response.status, diagnostics);
  }
  return data as T;
}
