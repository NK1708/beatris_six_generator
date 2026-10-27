export const api = {
    async get(url) {
        return parseResponse(await fetch(url));
    },
    async post(url, body) {
        return parseResponse(await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    },
    async put(url, body) {
        return parseResponse(await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    },
    async delete(url, body) {
        return parseResponse(await fetch(url, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    },
    async getFrameTargetStoryState(frameId) {
        return api.get(`/api/frames/${encodeURIComponent(frameId)}/target-story-state`);
    },
    async initializeFrameTargetStoryState(frameId) {
        return api.post(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/initialize`, {});
    },
    async updateFrameTargetStoryState(frameId, input) {
        return api.put(`/api/frames/${encodeURIComponent(frameId)}/target-story-state`, input);
    },
    async getFrameTargetRecoveryCandidates(frameId) {
        return api.get(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/recovery-candidates`);
    },
    async recoverFrameTargetStoryState(frameId, input) {
        return api.post(`/api/frames/${encodeURIComponent(frameId)}/target-story-state/recover`, input);
    }
};
export class ApiError extends Error {
    code;
    status;
    diagnostics;
    constructor(message, code, status, diagnostics = []) {
        super(message);
        this.code = code;
        this.status = status;
        this.diagnostics = diagnostics;
        this.name = "ApiError";
    }
}
async function parseResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Запрос не выполнен";
        const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : null;
        const diagnostics = typeof data === "object" && data !== null && "diagnostics" in data && Array.isArray(data.diagnostics)
            ? data.diagnostics.filter((item) => typeof item === "string")
            : [];
        throw new ApiError(message, code, response.status, diagnostics);
    }
    return data;
}
