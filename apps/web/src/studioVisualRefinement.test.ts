import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ProjectOverview } from "./screens/ProjectScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import type { Project } from "./model.js";

const project: Project = {
  id: "visual-fixture", name: "Visual fixture", description: "", rootPath: "unused-fixture-path",
  defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "draft-fixture", defaultProductionModel: "production-fixture",
  characters: [], locations: [], styleProfiles: [], scenes: []
};

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, element));
  client.clear();
  return html;
}

describe("Studio visual refinement", () => {
  it("keeps project deletion collapsed while retaining the existing deletion controls", () => {
    const html = render(React.createElement(ProjectOverview, { project }));
    const disclosure = html.match(/<details class="projectDangerDisclosure"([^>]*)>/u);
    expect(disclosure).not.toBeNull();
    expect(disclosure![1]).not.toMatch(/\bopen\b/u);
    expect(html).toContain("Также удалить папку проекта");
    expect(html).toContain("Без галки проект удаляется только из списка");
    expect(html).toContain("Персонажи");
    expect(html).toContain("Локации");
    expect(html).toContain("Стили");
    expect(html).toContain("Сцены");
    expect(html).not.toContain('class="frameEditor"');
  });

  it("retains all four editable settings with their labels, values and save action", () => {
    const html = render(React.createElement(SettingsScreen, { project }));
    expect(html).toContain('aria-label="Настройки проекта"');
    expect(html.match(/<input\b/gu)).toHaveLength(4);
    expect(html.match(/<label>/gu)).toHaveLength(4);
    for (const value of ["16:9", "1K", "draft-fixture", "production-fixture"]) expect(html).toContain(`value="${value}"`);
    expect(html).toContain("Сохранить");
  });
});
