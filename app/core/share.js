// Mampat jadual ke dalam bahagian '#' URL untuk QR laptop -> phone.
// '#' tak pernah dihantar ke server, jadi jadual tak tersimpan di mana-mana.

export const WEB_URL = "https://naaasruul.github.io/upmscheduler/";

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeState(st) {
  const compact = {
    v: 1,
    t: st.title,
    th: st.theme,
    s: st.semesterId,
    c: st.campus,
    sub: st.model.subjects.map((s) => [s.code, s.name, s.short, s.color]),
    it: st.model.items.map((i) => [i.subject, i.kind === "amali" ? 1 : 0, i.day, i.start, i.end, i.venue]),
    ex: st.exams ? [st.exams.isDraft ? 1 : 0, st.exams.exams.map((e) => [e.code, e.date, e.start, e.end, e.venue]), st.exams.pending] : null,
  };
  const json = new TextEncoder().encode(JSON.stringify(compact));
  return b64url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeState(str) {
  const json = new TextDecoder().decode(await pipe(unb64url(str), new DecompressionStream("deflate-raw")));
  const c = JSON.parse(json);
  if (c.v !== 1) throw new Error("Versi data tak dikenali");
  return {
    title: c.t,
    theme: c.th,
    semesterId: c.s,
    campus: c.c,
    model: {
      subjects: c.sub.map(([code, name, short, color]) => ({ code, name, short, color })),
      items: c.it.map(([subject, k, day, start, end, venue]) => ({ subject, kind: k ? "amali" : "kuliah", day, start, end, venue })),
    },
    exams: c.ex ? { isDraft: !!c.ex[0], exams: c.ex[1].map(([code, date, start, end, venue]) => ({ code, date, start, end, venue })), pending: c.ex[2] || [] } : null,
  };
}

export async function shareUrl(st) {
  return `${WEB_URL}#d=${await encodeState(st)}`;
}
