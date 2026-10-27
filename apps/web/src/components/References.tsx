import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
export function ReferenceSlots({ project, ownerType, ownerId, references, slots, onChanged }: { project: Project; ownerType: OwnerType; ownerId: string; references: Reference[]; slots: string[]; onChanged(): void }) {
  return (
    <section className="sideSection">
      <h3>Референсы</h3>
      {slots.map((slot) => {
        const versions = references.filter((reference) => (reference.type ?? "REF") === slot).sort((left, right) => right.version - left.version);
        const locked = versions.filter((reference) => reference.status === "LOCKED");
        const canonical = locked[0];
        const history = versions.filter((reference) => ownerType === "style" ? reference.status !== "LOCKED" : reference.id !== canonical?.id);
        const styleAtLimit = ownerType === "style" && locked.length >= 6;
        return (
          <div className="versionBlock" key={slot}>
            <div className="toolbar"><strong>{slot}</strong><ReferenceUpload ownerType={ownerType} ownerId={ownerId} type={slot} label={ownerType === "style" ? "+ Добавить референс" : "Загрузить"} onDone={onChanged} /></div>
            {ownerType === "style" ? <p className="muted">Активных style refs: {locked.length}/6. Используются только как visual style guidance, не как содержимое сцены.</p> : null}
            {styleAtLimit ? <p className="warning">Достигнут лимит 6 активных style references. Выведите один из канона перед закреплением нового.</p> : null}
            {ownerType === "style" && locked.length ? (
              <div>
                <p className="muted">Активный style canon</p>
                {locked.map((reference) => <ReferenceVersion key={reference.id} project={project} ownerType={ownerType} reference={reference} onChanged={onChanged} />)}
              </div>
            ) : canonical ? (
              <div>
                <p className="muted">Текущий канон</p>
                <ReferenceVersion project={project} ownerType={ownerType} reference={canonical} onChanged={onChanged} />
              </div>
            ) : <p className="warning">LOCKED-референс для этого слота не выбран.</p>}
            {history.length ? (
              <details>
                <summary>Версии и кандидаты ({history.length})</summary>
                {history.map((reference) => <ReferenceVersion key={reference.id} project={project} ownerType={ownerType} reference={reference} onChanged={onChanged} />)}
              </details>
            ) : null}
            {!versions.length ? <p className="muted">Версий пока нет.</p> : null}
          </div>
        );
      })}
    </section>
  );
}

function ReferenceUpload({ ownerType, ownerId, type, label, onDone }: { ownerType: OwnerType; ownerId: string; type: string; label: string; onDone(): void }) {
  const upload = useMutation({
    mutationFn: async (file: File) => api.post(referenceUploadPath(ownerType, ownerId), { type, fileName: file.name, dataUrl: await readFileAsDataUrl(file), description: "" }),
    onSuccess: onDone
  });
  return (
    <label className="uploadTile compactUpload">
      <ImagePlus size={15} /><span>{upload.isPending ? "Загрузка" : label}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); }} />
    </label>
  );
}

function ReferenceVersion({ project, ownerType, reference, onChanged }: { project: Project; ownerType: OwnerType; reference: Reference; onChanged(): void }) {
  const approve = useReferenceAction(ownerType, reference.id, "approve", onChanged);
  const reject = useReferenceAction(ownerType, reference.id, "reject", onChanged);
  const lock = useReferenceAction(ownerType, reference.id, "lock", onChanged);
  const deprecate = useReferenceAction(ownerType, reference.id, "deprecate", onChanged);
  return (
    <div className="versionRow">
      <div>
        <strong>V{reference.version}</strong> <StatusBadge status={reference.status} />
        <small>{reference.code}</small>
      </div>
      <div className="miniActions">
        {reference.filePath ? <img src={projectFileUrl(project, reference.filePath)} /> : null}
        <button disabled={reference.status !== "DRAFT"} onClick={() => approve.mutate()}><Check size={14} /> Одобрить</button>
        <button disabled={reference.status === "LOCKED"} onClick={() => lock.mutate()}><Check size={14} /> Закрепить</button>
        <button disabled={reference.status !== "LOCKED"} onClick={() => deprecate.mutate()}><X size={14} /> Убрать из канона</button>
        <button disabled={reference.status === "LOCKED"} onClick={() => reject.mutate()}><X size={14} /> Отклонить</button>
      </div>
    </div>
  );
}

function useReferenceAction(ownerType: OwnerType, referenceId: string, action: "approve" | "reject" | "lock" | "deprecate", onChanged: () => void) {
  return useMutation({
    mutationFn: () => api.post(`/api/references/${ownerType}/${referenceId}/${action}`, {}),
    onSuccess: onChanged
  });
}

export function StatusBadge({ status }: { status: AssetStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status}</span>;
}

export const characterSlots = ["MASTER", "FRONT", "THREE_QUARTER_LEFT", "THREE_QUARTER_RIGHT", "PROFILE_LEFT", "PROFILE_RIGHT", "FULL_BODY_FRONT", "FULL_BODY_SIDE", "FULL_BODY_BACK", "EXPRESSION", "OTHER"];
export const outfitSlots = ["MASTER", "FRONT", "SIDE", "BACK", "DETAIL"];
export const locationSlots = ["MASTER", "FLOOR_PLAN", "DETAIL", "OTHER"];

function referenceUploadPath(ownerType: OwnerType, ownerId: string): string {
  if (ownerType === "character") return `/api/characters/${ownerId}/references`;
  if (ownerType === "outfit") return `/api/outfits/${ownerId}/references`;
  if (ownerType === "location") return `/api/locations/${ownerId}/references`;
  if (ownerType === "locationAngle") return `/api/location-angles/${ownerId}/references`;
  return `/api/styles/${ownerId}/references`;
}
