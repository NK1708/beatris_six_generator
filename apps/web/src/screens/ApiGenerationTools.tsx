import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { api } from "../api.js";
import type { Generation, PreviewResponse, Project } from "../model.js";

export function ApiGenerationTools({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const frames = project.scenes.flatMap((scene) => scene.frames);
  const [frameId, setFrameId] = React.useState(frames[0]?.id ?? "");
  const activeFrameId = frames.some((frame) => frame.id === frameId) ? frameId : frames[0]?.id ?? "";
  const preview = useQuery({
    queryKey: ["preview", activeFrameId],
    queryFn: () => api.get<PreviewResponse>(`/api/frames/${activeFrameId}/preview`),
    enabled: Boolean(activeFrameId)
  });
  const generate = useMutation({
    mutationFn: (mode: "draft" | "production") => api.post<Generation>("/api/generations", { frameId: activeFrameId, mode }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  const blocked = preview.data?.warnings.some((warning) => warning.severity === "blocking") ?? true;
  return <section className="fieldStack">
    <h2>API generation</h2>
    <label>Кадр<select value={activeFrameId} onChange={(event) => setFrameId(event.target.value)}>
      {project.scenes.map((scene) => scene.frames.map((frame) => <option key={frame.id} value={frame.id}>{scene.name} / {frame.frameCode}</option>))}
    </select></label>
    <div className="toolbar">
      <button disabled={!activeFrameId || generate.isPending} onClick={() => generate.mutate("draft")}><Play size={16} /> Draft</button>
      <button disabled={!activeFrameId || blocked || generate.isPending} onClick={() => generate.mutate("production")}><Play size={16} /> Production</button>
    </div>
    {preview.data?.warnings.map((warning) => <p className={warning.severity === "blocking" ? "warning blocking" : "warning"} key={`${warning.code}-${warning.entityId}`}>{warning.message}</p>)}
    {generate.error ? <p className="warning">{generate.error.message}</p> : null}
  </section>;
}
