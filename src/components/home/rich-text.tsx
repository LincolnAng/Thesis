import { Fragment, type ReactNode } from "react";

/**
 * BAi's replies, laid out: paragraphs, bulleted and numbered lists, short bold headings and bold
 * words — written by the model in simple Markdown and shown here as formatting, so nobody reads
 * a line of asterisks. Deliberately small: no tables, images, links or raw HTML (the text never
 * becomes HTML, so nothing in a reply can run as code).
 */

/** **bold** and *italic* inside a line. Stray asterisks that don't pair up are dropped. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] ?? m[2]) out.push(<strong key={`${key}-b${i++}`} className="font-semibold">{m[1] ?? m[2]}</strong>);
    else out.push(<em key={`${key}-i${i++}`}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Anything left over like "**" or a lone "*" at a line start is noise, not formatting.
  return out.map((part) => (typeof part === "string" ? part.replace(/\*\*/g, "").replace(/(^|\s)\*(\s|$)/g, "$1$2") : part));
}

/** One line of model text with its **bold** shown as bold and any stray asterisks dropped. */
export function InlineText({ text }: { text: string }) {
  return <>{inline(text, "t")}</>;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[]; start: number };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const push = (b: Block) => blocks.push(b);
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] }); // a break; empty paragraphs are dropped below
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (heading) push({ kind: "h", text: heading[1].replace(/\*\*/g, "") });
    else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) push({ kind: "p", lines: [] }); // a horizontal rule
    else if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else push({ kind: "ul", items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[2]);
      else push({ kind: "ol", items: [numbered[2]], start: Number(numbered[1]) });
    } else if (last?.kind === "p" && last.lines.length > 0) last.lines.push(line.trim());
    else if ((last?.kind === "ul" || last?.kind === "ol") && /^\s{2,}/.test(raw)) last.items[last.items.length - 1] += ` ${line.trim()}`;
    else push({ kind: "p", lines: [line.trim()] });
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        if (b.kind === "h") return <p key={key} className="pt-1 font-semibold">{inline(b.text, key)}</p>;
        if (b.kind === "ul")
          return (
            <ul key={key} className="list-disc space-y-1 pl-5 marker:text-cacao/70">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={key} start={b.start} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-cacao/80">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `${key}-${j}`)}</li>
              ))}
            </ol>
          );
        return (
          <p key={key}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${key}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
