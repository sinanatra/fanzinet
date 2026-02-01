import { json } from "@sveltejs/kit";

const allowedOrigin = "https://www.paolopalmacci.it";

function decodeHtmlEntities(text) {
  if (!text) return "";
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToText(fragment) {
  if (!fragment) return "";
  let out = fragment;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son\w+="[^"]*"/gi, "");
  out = out.replace(/\son\w+='[^']*'/gi, "");
  out = out.replace(/\sstyle="[^"]*"/gi, "");
  out = out.replace(/\salign="[^"]*"/gi, "");
  out = out.replace(/<img\b[\s\S]*?>/gi, "");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/p>/gi, "\n\n");
  out = out.replace(/<[^>]+>/g, "");
  out = decodeHtmlEntities(out);
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function extractContent(html) {
  const descriptionMatch = html.match(
    /<meta\s+name="description"\s+content="([^"]*)"\s*>/i,
  );
  const description = decodeHtmlEntities(
    descriptionMatch ? descriptionMatch[1].trim() : "",
  );

  const contentMatch = html.match(
    /<div\s+class="wow fadeInUp col-md-7 col-sm-7"[\s\S]*?>([\s\S]*?)<\/div>/i,
  );
  if (!contentMatch) return { description, text: "" };

  const fragment = contentMatch[1];
  return { description, text: htmlToText(fragment) };
}

export async function GET({ url, fetch }) {
  const target = url.searchParams.get("url");
  if (!target) return json({ error: "Missing url" }, { status: 400 });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.origin !== allowedOrigin || !parsed.pathname.startsWith("/capitmundi/")) {
    return json({ error: "URL not allowed" }, { status: 400 });
  }

  const res = await fetch(parsed.toString());
  if (!res.ok) return json({ error: "Upstream fetch failed" }, { status: 502 });

  const html = await res.text();
  const extracted = extractContent(html);

  return json(extracted, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
