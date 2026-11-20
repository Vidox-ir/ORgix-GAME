const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8"
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secretBag = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey =
  secretBag.default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const publishableBag = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const allowedClientKeys = [
  ...Object.values(publishableBag),
  Deno.env.get("SUPABASE_ANON_KEY") ?? ""
].filter((value) => typeof value === "string" && value.length > 0);

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function cleanNickname(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "نام بازیکن را وارد کن.");
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 18 ||
      !/^[\p{L}\p{N} _.-]+$/u.test(nickname)) {
    throw new ApiError(400, "نام باید ۲ تا ۱۸ نویسه و بدون علامت خاص باشد.");
  }
  return nickname;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function db(path: string, init: RequestInit = {}): Promise<any> {
  if (!PROJECT_URL || !serviceKey) {
    throw new ApiError(503, "پیکربندی سرویس ذخیره‌سازی کامل نیست.");
  }
  const response = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(init.headers ?? {})
    }
  });
  const body = await response.text();
  if (!response.ok) {
    console.error("Database request failed:", response.status, body.slice(0, 500));
    throw new ApiError(503, "ارتباط با پایگاه داده انجام نشد.");
  }
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}

async function rateLimit(req: Request, action: string) {
  const forwarded = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = await sha256(`ironvale:${action}:${forwarded}`);
  const limits: Record<string, [number, number]> = {
    join: [8, 3600],
    load: [45, 60],
    save: [15, 60]
  };
  const [maxHits, windowSeconds] = limits[action] ?? [30, 60];
  const allowed = await db("rpc/ironvale_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_key: key,
      p_max_hits: maxHits,
      p_window_seconds: windowSeconds
    })
  });
  if (allowed !== true) throw new ApiError(429, "درخواست‌های زیادی فرستاده شد؛ کمی بعد دوباره تلاش کن.");
}

async function authenticate(token: unknown) {
  if (typeof token !== "string" || token.length < 32 || token.length > 100) {
    throw new ApiError(401, "نشست مهمان معتبر نیست.");
  }
  const tokenHash = await sha256(token);
  const rows = await db(
    `ironvale_guest_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,player_id`,
    { method: "GET" }
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new ApiError(401, "نشست منقضی شده است؛ دوباره با نامت وارد شو.");
  }
  const session = rows[0];
  const expiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  await db(`ironvale_guest_sessions?id=eq.${session.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), expires_at: expiry }),
    headers: { "Prefer": "return=minimal" }
  });
  return session.player_id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "روش درخواست پشتیبانی نمی‌شود." });

  try {
    const suppliedKey = req.headers.get("apikey") ?? "";
    if (!allowedClientKeys.includes(suppliedKey)) {
      throw new ApiError(401, "کلید عمومی پروژه معتبر نیست.");
    }

    const raw = await req.text();
    if (raw.length > 70_000) throw new ApiError(413, "حجم درخواست بیش از حد مجاز است.");
    let payload: any;
    try { payload = JSON.parse(raw); } catch { throw new ApiError(400, "درخواست نامعتبر است."); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ApiError(400, "ساختار درخواست نامعتبر است.");
    }

    const action = payload.action;
    if (action !== "join" && action !== "load" && action !== "save") {
      throw new ApiError(400, "عملیات ناشناخته است.");
    }
    await rateLimit(req, action);

    if (action === "join") {
      const nickname = cleanNickname(payload.nickname);
      const token = makeToken();
      const tokenHash = await sha256(token);
      const players = await db("ironvale_players?select=id,nickname", {
        method: "POST",
        body: JSON.stringify({ nickname })
      });
      if (!Array.isArray(players) || players.length !== 1) {
        throw new ApiError(503, "ساخت پروفایل مهمان انجام نشد.");
      }
      const player = players[0];
      try {
        await db("ironvale_guest_sessions", {
          method: "POST",
          body: JSON.stringify({
            player_id: player.id,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          })
        });
      } catch (error) {
        await db(`ironvale_players?id=eq.${player.id}`, {
          method: "DELETE",
          headers: { "Prefer": "return=minimal" }
        }).catch(() => null);
        throw error;
      }
      return reply(200, { ok: true, token, player: { id: player.id, nickname: player.nickname } });
    }

    const playerId = await authenticate(payload.token);

    if (action === "load") {
      const rows = await db(
        `ironvale_players?id=eq.${playerId}&select=id,nickname,save_data,updated_at`,
        { method: "GET" }
      );
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new ApiError(404, "ذخیره‌ای برای این بازیکن پیدا نشد.");
      }
      const row = rows[0];
      return reply(200, {
        ok: true,
        player: { id: row.id, nickname: row.nickname },
        save_data: row.save_data,
        updated_at: row.updated_at
      });
    }

    const saveData = payload.save_data;
    if (!saveData || typeof saveData !== "object" || Array.isArray(saveData) ||
        saveData.version !== 1) {
      throw new ApiError(400, "ساختار فایل ذخیره‌سازی معتبر نیست.");
    }
    if (JSON.stringify(saveData).length > 55_000) {
      throw new ApiError(413, "حجم ذخیره‌سازی بیش از حد مجاز است.");
    }

    const savedAt = new Date().toISOString();
    await db(`ironvale_players?id=eq.${playerId}`, {
      method: "PATCH",
      body: JSON.stringify({ save_data: saveData, updated_at: savedAt }),
      headers: { "Prefer": "return=minimal" }
    });
    return reply(200, { ok: true, saved_at: savedAt });
  } catch (error) {
    if (error instanceof ApiError) return reply(error.status, { error: error.message });
    console.error("Unhandled guest API error:", error);
    return reply(500, { error: "خطای داخلی سرویس مهمان رخ داد." });
  }
});