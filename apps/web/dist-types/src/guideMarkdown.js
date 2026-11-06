// Deliberately supports the small, safe Markdown subset used by the bundled guide.
// Raw HTML is always rendered as text; no HTML injection or runtime fetch is needed.
export function parseGuide(markdown) {
    const lines = markdown.replace(/\r/g, "").split("\n"), blocks = [], counts = new Map();
    for (let i = 0; i < lines.length;) {
        const line = lines[i].trim();
        if (!line) {
            i++;
            continue;
        }
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        if (heading) {
            const base = heading[2].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
            const count = counts.get(base) ?? 0;
            counts.set(base, count + 1);
            blocks.push({ kind: "heading", text: heading[2], level: heading[1].length, id: count ? `${base}-${count + 1}` : base });
            i++;
            continue;
        }
        const picture = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
        if (picture) {
            blocks.push({ kind: "image", text: picture[1], src: picture[2] });
            i++;
            continue;
        }
        const list = /^(?:\d+\. |[-*] )/.exec(line);
        if (list) {
            const ordered = /^\d/.test(line), pattern = ordered ? /^\d+\. (.+)$/ : /^[-*] (.+)$/;
            const items = [];
            while (i < lines.length) {
                const match = pattern.exec(lines[i].trim());
                if (!match)
                    break;
                items.push(match[1]);
                i++;
            }
            blocks.push({ kind: ordered ? "ordered" : "unordered", text: "", items });
            continue;
        }
        if (line.startsWith("> ")) {
            blocks.push({ kind: "quote", text: line.slice(2) });
            i++;
            continue;
        }
        const paragraph = [line];
        i++;
        while (i < lines.length && lines[i].trim() && !/^(?:#|!\[|> |\d+\. |[-*] )/.test(lines[i].trim()))
            paragraph.push(lines[i++].trim());
        blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    }
    return blocks;
}
