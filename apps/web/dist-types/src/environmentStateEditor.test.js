import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { EnvironmentStateEditor, environmentRowErrors, reportEnvironmentValidity, rowsToEnvironment } from "./components/EnvironmentStateEditor.js";
const base = { sceneId: "test", time: { description: "" }, environment: { weather: true, door: "closed", floor: 2 }, characters: {}, props: {}, storyFacts: [] };
function mount() {
    let state = structuredClone(base);
    const onChange = vi.fn((next) => { state = next; renderer.update(element()); });
    const element = () => React.createElement(EnvironmentStateEditor, { state, onChange });
    let renderer;
    act(() => { renderer = create(element()); });
    const names = () => renderer.root.findAllByProps({ "aria-label": "Имя параметра окружения" });
    const values = () => renderer.root.findAllByProps({ "aria-label": "Значение параметра окружения" });
    const change = (index, value) => act(() => names()[index].props.onChange({ target: { value } }));
    return { renderer, names, values, change, onChange, state: () => state };
}
describe("Scene environment rows", () => {
    it("types door incrementally without remounting the active input", () => {
        const m = mount();
        act(() => m.renderer.root.findAllByType("button")[0].props.onClick());
        const input = m.names()[3];
        for (const value of ["d", "do", "doo", "doorway"]) {
            m.change(3, value);
            // The same host instance is retained: React does not replace a focused input.
            expect(m.names()[3]).toBe(input);
        }
        m.change(1, "entrance");
        m.change(3, "door");
        expect(m.state().environment).toEqual({ weather: true, entrance: "closed", floor: 2, door: "" });
    });
    it("renames an existing key and edits its value, retaining other typed values", () => {
        const m = mount();
        m.change(1, "entrance");
        act(() => m.values()[1].props.onChange({ target: { value: "open" } }));
        expect(m.state().environment).toEqual({ weather: true, entrance: "open", floor: 2 });
    });
    it("retains a temporarily empty row and never emits an empty key", () => {
        const m = mount();
        const input = m.names()[1];
        m.change(1, "");
        expect(m.names()[1]).toBe(input);
        expect(m.names()[1].props.value).toBe("");
        expect(m.names()[1].props["aria-invalid"]).toBe(true);
        expect(m.state().environment).toEqual(base.environment);
        m.change(1, "door");
        expect(m.state().environment).toEqual(base.environment);
    });
    it("rejects duplicate trimmed names without overwriting either row", () => {
        const m = mount();
        m.change(1, " weather ");
        expect(m.onChange).not.toHaveBeenCalled();
        expect(m.names()[0].props["aria-invalid"]).toBe(true);
        expect(m.names()[1].props["aria-invalid"]).toBe(true);
        expect(m.values()[1].props.value).toBe("closed");
        m.change(1, "entrance");
        expect(m.state().environment).toEqual({ weather: true, entrance: "closed", floor: 2 });
    });
    it("deletes only the selected row without remounting the remaining inputs", () => {
        const m = mount();
        const last = m.names()[2];
        act(() => m.renderer.root.findAllByProps({ title: "Удалить" })[1].props.onClick());
        expect(m.names()[1]).toBe(last);
        expect(m.state().environment).toEqual({ weather: true, floor: 2 });
    });
    it("converts valid rows to the persisted object and rejects invalid drafts", () => {
        const row = { id: "stable", name: " door ", value: "closed" };
        expect(rowsToEnvironment([row])).toEqual({ door: "closed" });
        expect(rowsToEnvironment([{ ...row, name: " " }])).toBeNull();
        expect(rowsToEnvironment([row, { ...row, id: "other" }])).toBeNull();
        expect(environmentRowErrors([row])).toEqual([""]);
        expect(rowsToEnvironment([{ ...row, name: "__proto__" }])).toHaveProperty("__proto__", "closed");
    });
    it("blocks the Scene save boundary when native environment validity fails", () => {
        const reportValidity = vi.fn(() => false);
        const container = { querySelectorAll: () => [{ reportValidity }] };
        expect(reportEnvironmentValidity(container)).toBe(false);
        expect(reportValidity).toHaveBeenCalledOnce();
        expect(reportEnvironmentValidity({ querySelectorAll: () => [] })).toBe(true);
    });
    it("retains invalid local rows when another Scene field changes, and resets on scene change", () => {
        const m = mount();
        m.change(1, "");
        act(() => m.renderer.update(React.createElement(EnvironmentStateEditor, { state: { ...m.state(), storyFacts: ["fact"] }, onChange: m.onChange })));
        expect(m.names()[1].props.value).toBe("");
        act(() => m.renderer.update(React.createElement(EnvironmentStateEditor, { state: { ...base, sceneId: "other", environment: { lights: "on" } }, onChange: m.onChange })));
        expect(m.names()).toHaveLength(1);
        expect(m.names()[0].props.value).toBe("lights");
    });
});
