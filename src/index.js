const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}
function validUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.toString() : null;
  } catch { return null; }
}
function makeSlug(length = 7) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => chars[b % chars.length]).join("");
}
function deviceFromUA(ua) {
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|iphone|android/i.test(ua)) return "Mobile";
  return "Desktop";
}
function browserFromUA(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Other";
}
async function authorized(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return !!env.ADMIN_PASSWORD && token === env.ADMIN_PASSWORD;
}
async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    if (path === "/api/health") return json({ ok: true, service: "QuickLink" });

    if (path === "/api/login" && request.method === "POST") {
      const body = await readBody(request);
      if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
        return json({ error: "Incorrect password" }, 401);
      }
      return json({ ok: true, token: env.ADMIN_PASSWORD });
    }

    if (path.startsWith("/api/")) {
      if (!(await authorized(request, env))) return json({ error: "Unauthorized" }, 401);

      if (path === "/api/links" && request.method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT l.slug, l.original_url, l.title, l.created_at, l.is_active,
                 COUNT(c.id) AS clicks
          FROM links l LEFT JOIN clicks c ON c.slug = l.slug
          GROUP BY l.slug ORDER BY l.created_at DESC
        `).all();
        return json({ links: results || [] });
      }

      if (path === "/api/links" && request.method === "POST") {
        const body = await readBody(request);
        const original = validUrl(body.url);
        if (!original) return json({ error: "Enter a valid http:// or https:// URL" }, 400);

        let slug = cleanText(body.slug, 32).replace(/[^a-zA-Z0-9_-]/g, "");
        if (slug && slug.length < 3) return json({ error: "Custom alias must be at least 3 characters" }, 400);
        if (!slug) {
          for (let i = 0; i < 5; i++) {
            const candidate = makeSlug();
            const exists = await env.DB.prepare("SELECT slug FROM links WHERE slug = ?").bind(candidate).first();
            if (!exists) { slug = candidate; break; }
          }
        }
        if (!slug) return json({ error: "Could not create a unique alias. Try again." }, 500);

        try {
          await env.DB.prepare(
            "INSERT INTO links (slug, original_url, title) VALUES (?, ?, ?)"
          ).bind(slug, original, cleanText(body.title, 100) || null).run();
        } catch {
          return json({ error: "This alias is already in use. Choose another one." }, 409);
        }
        return json({ ok: true, slug, short_url: `${url.origin}/${slug}` }, 201);
      }

      if (path.startsWith("/api/links/") && request.method === "DELETE") {
        const slug = path.split("/").pop();
        await env.DB.prepare("DELETE FROM clicks WHERE slug = ?").bind(slug).run();
        const result = await env.DB.prepare("DELETE FROM links WHERE slug = ?").bind(slug).run();
        return json({ ok: true, changes: result.meta?.changes || 0 });
      }

      if (path === "/api/analytics" && request.method === "GET") {
        const slug = cleanText(url.searchParams.get("slug"), 32);
        const where = slug ? "WHERE slug = ?" : "";
        const query = env.DB.prepare(`SELECT COUNT(*) AS total_clicks,
          COUNT(DISTINCT country) AS countries,
          COUNT(DISTINCT referrer) AS referrers
          FROM clicks ${where}`);
        const summary = slug ? await query.bind(slug).first() : await query.first();
        const dailyQuery = env.DB.prepare(`SELECT substr(clicked_at,1,10) AS day, COUNT(*) AS clicks
          FROM clicks ${where} GROUP BY day ORDER BY day DESC LIMIT 14`);
        const daily = slug ? await dailyQuery.bind(slug).all() : await dailyQuery.all();
        const countriesQuery = env.DB.prepare(`SELECT COALESCE(country,'Unknown') AS name, COUNT(*) AS clicks
          FROM clicks ${where} GROUP BY country ORDER BY clicks DESC LIMIT 8`);
        const countries = slug ? await countriesQuery.bind(slug).all() : await countriesQuery.all();
        const devicesQuery = env.DB.prepare(`SELECT COALESCE(device,'Unknown') AS name, COUNT(*) AS clicks
          FROM clicks ${where} GROUP BY device ORDER BY clicks DESC`);
        const devices = slug ? await devicesQuery.bind(slug).all() : await devicesQuery.all();
        const recentQuery = env.DB.prepare(`SELECT slug, clicked_at, COALESCE(country,'Unknown') AS country,
          COALESCE(device,'Unknown') AS device, COALESCE(browser,'Unknown') AS browser,
          COALESCE(referrer,'Direct') AS referrer FROM clicks ${where}
          ORDER BY clicked_at DESC LIMIT 25`);
        const recent = slug ? await recentQuery.bind(slug).all() : await recentQuery.all();
        return json({ summary, daily: daily.results || [], countries: countries.results || [],
          devices: devices.results || [], recent: recent.results || [] });
      }

      return json({ error: "API route not found" }, 404);
    }

    // A short link resolves directly at the edge.
    const slug = path.replace(/^\/+|\/+$/g, "");
    if (slug && !slug.includes("/") && slug !== "favicon.ico") {
      const link = await env.DB.prepare(
        "SELECT original_url FROM links WHERE slug = ? AND is_active = 1"
      ).bind(slug).first();

      if (link?.original_url) {
        const ua = request.headers.get("user-agent") || "";
        const ref = request.headers.get("referer") || "";
        const country = request.cf?.country || "Unknown";
        // Log without delaying the redirect; D1 write runs in the request lifetime.
        ctx.waitUntil(env.DB.prepare(
          "INSERT INTO clicks (slug, referrer, country, device, browser) VALUES (?, ?, ?, ?, ?)"
        ).bind(slug, ref ? new URL(ref).hostname : "Direct", country,
          deviceFromUA(ua), browserFromUA(ua)).run());
        return Response.redirect(link.original_url, 302);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
