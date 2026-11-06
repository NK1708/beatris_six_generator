import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { ArrowLeft, ArrowUp } from "lucide-react";
import markdown from "../../../../docs/USER_GUIDE_RU.md?raw";
import { parseGuide } from "../guideMarkdown.js";
const images = import.meta.glob("../../../../docs/user-guide/images/*", { eager: true, query: "?url", import: "default" });
const blocks = parseGuide(markdown);
function Inline({ text }) {
    return _jsx(_Fragment, { children: text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g).map((part, i) => {
            if (part.startsWith("**"))
                return _jsx("strong", { children: part.slice(2, -2) }, i);
            if (part.startsWith("`"))
                return _jsx("code", { children: part.slice(1, -1) }, i);
            const link = /^\[([^\]]+)\]\((#[^)]+)\)$/.exec(part);
            return link ? _jsx("a", { href: link[2], onClick: event => { event.preventDefault(); jump(link[2].slice(1)); }, children: link[1] }, i) : part;
        }) });
}
function jump(id) { const target = document.getElementById(id); target?.scrollIntoView({ block: "start" }); target?.focus({ preventScroll: true }); }
export function UserGuide({ onBack }) {
    const root = React.useRef(null);
    React.useEffect(() => { root.current?.querySelector("h1")?.focus(); }, []);
    return _jsxs("main", { className: "centerPane userGuide", ref: root, "aria-label": "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", children: [_jsxs("header", { className: "guideHeader", children: [_jsx("h1", { tabIndex: -1, children: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" }), _jsxs("button", { type: "button", onClick: onBack, children: [_jsx(ArrowLeft, { size: 16 }), " \u041A \u0440\u0430\u0431\u043E\u0442\u0435"] })] }), _jsxs("div", { className: "guideLayout", children: [_jsxs("nav", { className: "guideContents", "aria-label": "\u041E\u0433\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u0430", children: [_jsx("h2", { children: "\u041E\u0433\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435" }), blocks.filter(block => block.kind === "heading" && block.level === 2).map(block => _jsx("a", { href: "#" + block.id, onClick: event => { event.preventDefault(); jump(block.id); }, children: block.text }, block.id))] }), _jsxs("article", { className: "guideArticle", children: [blocks.map((block, index) => {
                                if (block.kind === "heading")
                                    return block.level === 1 ? null : block.level === 2 ? _jsx("h2", { id: block.id, tabIndex: -1, children: block.text }, index) : _jsx("h3", { id: block.id, tabIndex: -1, children: block.text }, index);
                                if (block.kind === "image") {
                                    const src = images["../../../../docs/" + block.src];
                                    return src ? _jsxs("figure", { children: [_jsx("img", { src: src, alt: block.text, loading: "lazy" }), _jsx("figcaption", { children: block.text })] }, index) : null;
                                }
                                if (block.kind === "quote")
                                    return _jsx("blockquote", { children: _jsx(Inline, { text: block.text }) }, index);
                                if (block.items) {
                                    const items = block.items.map((item, i) => _jsx("li", { children: _jsx(Inline, { text: item }) }, i));
                                    return block.kind === "ordered" ? _jsx("ol", { children: items }, index) : _jsx("ul", { children: items }, index);
                                }
                                return _jsx("p", { children: _jsx(Inline, { text: block.text }) }, index);
                            }), _jsxs("button", { type: "button", className: "guideTop", onClick: () => { root.current?.scrollTo({ top: 0 }); root.current?.querySelector("h1")?.focus({ preventScroll: true }); }, children: [_jsx(ArrowUp, { size: 16 }), " \u041A \u043D\u0430\u0447\u0430\u043B\u0443"] })] })] })] });
}
