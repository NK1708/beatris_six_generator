import React from "react";
import { ArrowLeft, ArrowUp } from "lucide-react";
import markdown from "../../../../docs/USER_GUIDE_RU.md?raw";
import { parseGuide } from "../guideMarkdown.js";

const images = import.meta.glob<string>("../../../../docs/user-guide/images/*", { eager: true, query: "?url", import: "default" });
const blocks = parseGuide(markdown);
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((#[^)]+)\)$/.exec(part);
    return link ? <a key={i} href={link[2]} onClick={event => { event.preventDefault(); jump(link[2]!.slice(1)); }}>{link[1]}</a> : part;
  })}</>;
}
function jump(id: string) { const target = document.getElementById(id); target?.scrollIntoView({ block: "start" }); target?.focus({ preventScroll: true }); }

export function UserGuide({ onBack }: { onBack(): void }) {
  const root = React.useRef<HTMLElement>(null);
  React.useEffect(() => { root.current?.querySelector("h1")?.focus(); }, []);
  return <main className="centerPane userGuide" ref={root} aria-label="Руководство пользователя">
    <header className="guideHeader"><h1 tabIndex={-1}>Руководство пользователя</h1><button type="button" onClick={onBack}><ArrowLeft size={16} /> К работе</button></header>
    <div className="guideLayout"><nav className="guideContents" aria-label="Оглавление руководства"><h2>Оглавление</h2>{blocks.filter(block => block.kind === "heading" && block.level === 2).map(block => <a key={block.id} href={"#" + block.id} onClick={event => { event.preventDefault(); jump(block.id!); }}>{block.text}</a>)}</nav>
      <article className="guideArticle">{blocks.map((block, index) => {
        if (block.kind === "heading") return block.level === 1 ? null : block.level === 2 ? <h2 key={index} id={block.id} tabIndex={-1}>{block.text}</h2> : <h3 key={index} id={block.id} tabIndex={-1}>{block.text}</h3>;
        if (block.kind === "image") { const src = images["../../../../docs/" + block.src]; return src ? <figure key={index}><img src={src} alt={block.text} loading="lazy" /><figcaption>{block.text}</figcaption></figure> : null; }
        if (block.kind === "quote") return <blockquote key={index}><Inline text={block.text} /></blockquote>;
        if (block.items) { const items = block.items.map((item, i) => <li key={i}><Inline text={item} /></li>); return block.kind === "ordered" ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>; }
        return <p key={index}><Inline text={block.text} /></p>;
      })}<button type="button" className="guideTop" onClick={() => { root.current?.scrollTo({ top: 0 }); root.current?.querySelector("h1")?.focus({ preventScroll: true }); }}><ArrowUp size={16} /> К началу</button></article>
    </div>
  </main>;
}
