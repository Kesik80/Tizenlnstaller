// Проверяет ссылку на .wgt: жив ли адрес, что отдаёт сервер и какая внутри версия.
// Браузер сам это сделать не может — чужие домены не отдают CORS-заголовки.
//
// GET /api/check?url=<адрес>[&version=1]
//   version=1 — скачать пакет и вытащить <widget version> из config.xml

const zlib = require("zlib");

const MAX_BYTES = 24 * 1024 * 1024;
const TIMEOUT = 20000;

function bad(url) {
  let u;
  try { u = new URL(url); } catch { return "адрес не разбирается"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "только http и https";
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") ||
      /^(127|10)\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) ||
      h === "[::1]") return "локальные адреса недоступны";
  return null;
}

// --- минимальный читатель zip: ищем config.xml в центральном каталоге ---
function readConfigXml(buf) {
  // End of Central Directory: сигнатура 0x06054b50, ищем с конца
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("это не zip-архив");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("каталог архива повреждён");
    const method  = buf.readUInt16LE(p + 10);
    const compSz  = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen= buf.readUInt16LE(p + 30);
    const cmtLen  = buf.readUInt16LE(p + 32);
    const local   = buf.readUInt32LE(p + 42);
    const name    = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    if (name.toLowerCase() === "config.xml") {
      const lnLen = buf.readUInt16LE(local + 26);
      const leLen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnLen + leLen;
      const raw   = buf.slice(start, start + compSz);
      return method === 0 ? raw.toString("utf8")
                          : zlib.inflateRawSync(raw).toString("utf8");
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error("config.xml не найден — вряд ли это wgt");
}

const attr = (xml, re) => (xml.match(re) || [])[1] || null;

// версия из самого адреса: .../v1.0.31/ALPAC.wgt или lampa_v1.9.1.wgt
function versionFromUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  const path = decodeURIComponent(url.pathname);
  const file = path.split("/").pop() || "";
  const grab = s => {
    const hits = s.match(/(?:^|[\/_\-])v?(\d+\.\d+(?:\.\d+)*)/gi) || [];
    return hits.map(h => (h.match(/(\d+(?:\.\d+)+)/) || [])[1]).filter(Boolean).pop() || null;
  };
  const fromFile = grab(file);
  if (fromFile) return fromFile;
  // у релизов GitHub в пути стоит тег релиза, а не версия приложения
  if (/(^|\.)github\.com$/i.test(url.hostname) && /\/releases\/download\//i.test(path)) return null;
  return grab(path);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const url = (req.query && req.query.url) || "";
  const wantVersion = String((req.query && req.query.version) || "") === "1";

  const why = bad(url);
  if (why) return res.status(400).json({ ok: false, error: why });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  const started = Date.now();

  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (wgt-check)", "Accept": "*/*" },
    });

    const out = {
      ok: r.ok,
      status: r.status,
      finalUrl: r.url,
      redirected: r.url !== url,
      contentType: r.headers.get("content-type"),
      size: Number(r.headers.get("content-length")) || null,
      filename: null,
      ms: 0,
    };

    const cd = r.headers.get("content-disposition");
    if (cd) {
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      if (m) out.filename = decodeURIComponent(m[1].trim());
    }
    if (!out.filename) {
      try { out.filename = decodeURIComponent(new URL(r.url).pathname.split("/").pop()) || null; }
      catch {}
    }

    if (!r.ok) {
      out.verdict = "сервер ответил " + r.status;
      out.ms = Date.now() - started;
      return res.status(200).json(out);
    }

    // страница вместо файла — самый частый случай, когда домен протух
    if ((out.contentType || "").includes("text/html")) {
      out.ok = false;
      out.verdict = "отдаётся html-страница, а не файл";
      out.ms = Date.now() - started;
      return res.status(200).json(out);
    }

    if (wantVersion) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error("файл слишком большой");
      out.size = buf.length;
      try {
        const xml = readConfigXml(buf);
        out.version  = attr(xml, /<widget[^>]*\sversion\s*=\s*"([^"]*)"/i);
        out.urlVersion = versionFromUrl(r.url) || versionFromUrl(url);
        out.widgetId = attr(xml, /<widget[^>]*\sid\s*=\s*"([^"]*)"/i);
        out.appName  = attr(xml, /<name[^>]*>([^<]*)<\/name>/i);
        out.verdict  = "пакет читается";
      } catch (e) {
        out.ok = false;
        out.verdict = e.message;
      }
    } else {
      out.urlVersion = versionFromUrl(r.url) || versionFromUrl(url);
      out.verdict = "адрес отвечает";
    }

    out.ms = Date.now() - started;
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e.name === "AbortError" ? "сервер не ответил за 20 секунд" : String(e.message || e),
      ms: Date.now() - started,
    });
  } finally {
    clearTimeout(timer);
  }
};
