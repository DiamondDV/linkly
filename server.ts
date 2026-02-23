import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_change_me";

const getBaseUrl = (req: any) => {
  const envUrl = (process.env.APP_URL || "").trim();
  if (
    envUrl &&
    envUrl !== "MY_APP_URL" &&
    !envUrl.includes("your_app_url")
  ) {
    return envUrl.replace(/\/$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
};

const getCookieOptions = (req: any) => {
  const isLocalhost =
    req.hostname === "localhost" ||
    req.hostname === "127.0.0.1" ||
    req.hostname === "::1";
  const isSecure = !isLocalhost;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
  };
};

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase is not fully configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)."
  );
}
const supabase = createClient(supabaseUrl, supabaseKey);

const isMissingColumnError = (error: any, column: string) =>
  typeof error?.message === "string" &&
  error.message.includes(`'${column}'`) &&
  error.message.includes("schema cache");

const isUsersIdFkError = (error: any) =>
  typeof error?.message === "string" && error.message.includes("users_id_fkey");

const isLinksUserIdFkError = (error: any) =>
  typeof error?.message === "string" && error.message.includes("links_user_id_fkey");

const RESERVED_SLUGS = new Set([
  "api",
  "login",
  "signup",
  "dashboard",
  "auth",
]);

const normalizeSlug = (slug: string) => slug.trim().toLowerCase();
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const stableUuidFromString = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex");
  const raw = hex.slice(0, 32).split("");
  raw[12] = "4";
  const variantNibble = parseInt(raw[16], 16);
  raw[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const s = raw.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(
    20
  )}`;
};

const validateSlug = (slug: string) => {
  if (!slug) return "Slug is required";
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
    return "Use 3-64 chars: lowercase letters, numbers, hyphens";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "This slug is reserved";
  }
  return null;
};

const normalizeLongUrl = (input: string) => {
  const raw = (input || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const ensurePublicUserByEmail = async (email: string) => {
  const id = stableUuidFromString(`public-user:${email.toLowerCase()}`);
  let insertResult = await supabase
    .from("users")
    .insert({ id, email, password_hash: "OAUTH_USER" })
    .select("id")
    .single();

  if (insertResult.error && isMissingColumnError(insertResult.error, "password_hash")) {
    insertResult = await supabase
      .from("users")
      .insert({ id, email })
      .select("id")
      .single();
  }

  if (insertResult.error && insertResult.error.code === "23505") {
    const existing = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing.error && existing.data?.id) return existing.data.id;
  }

  if (insertResult.error) {
    return null;
  }

  return insertResult.data?.id || null;
};

const resolveAppUserId = async (req: any) => {
  const tokenUserId = typeof req.user?.id === "string" ? req.user.id : null;
  if (tokenUserId && isUuid(tokenUserId)) return tokenUserId;

  if (req.user?.email) {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", req.user.email)
      .maybeSingle();
    if (existingUser?.id && isUuid(existingUser.id)) return existingUser.id;

    const provisionedId = await ensurePublicUserByEmail(req.user.email);
    if (provisionedId && isUuid(provisionedId)) return provisionedId;
  }

  return null;
};

const findAuthUserIdByEmail = async (email: string) => {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Auth admin listUsers failed: ${error.message}`);
  const existing = data.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  return existing?.id || null;
};

const ensureAuthUserIdForEmail = async (email: string) => {
  const existingId = await findAuthUserIdByEmail(email);
  if (existingId) return existingId;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) {
    const fallbackId = await findAuthUserIdByEmail(email);
    if (fallbackId) return fallbackId;
    throw new Error(`Auth admin createUser failed: ${error.message}`);
  }
  return data.user.id;
};

// Middleware
app.use(express.json());
app.use(cookieParser());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      name?: string;
      picture?: string;
    };
    req.user = decoded;
    next();
  } catch (err) {
    next();
  }
};

app.use(authenticate);

// Helper: Get Usage
const checkUsage = async (identifier: string) => {
  const today = new Date().toISOString().split("T")[0];
  
  const { data: row } = await supabase
    .from("usage")
    .select("count")
    .eq("identifier", identifier)
    .eq("date", today)
    .single();

  const count = row ? row.count : 0;

  // If logged in, no limit for now
  if (identifier.startsWith("user:")) return { allowed: true, count };
  
  const limit = 10;
  return { allowed: count < limit, count };
};

const incrementUsage = async (identifier: string) => {
  const today = new Date().toISOString().split("T")[0];
  
  // Supabase upsert for usage
  const { data: existing } = await supabase
    .from("usage")
    .select("id, count")
    .eq("identifier", identifier)
    .eq("date", today)
    .single();

  if (existing) {
    await supabase
      .from("usage")
      .update({ count: existing.count + 1 })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("usage")
      .insert({ identifier, date: today, count: 1 });
  }
};

// API Routes

// Auth
app.get("/api/auth/google/url", (req, res) => {
  const redirectUri = `${getBaseUrl(req)}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const redirectUri = `${getBaseUrl(req)}/auth/google/callback`;

  try {
    if (!code || typeof code !== "string") {
      return res.status(400).send("Missing OAuth code");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      const details =
        tokens?.error_description || tokens?.error || "Unknown token exchange error";
      return res.status(400).send(`Authentication failed: ${details}`);
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!userRes.ok || !googleUser?.email) {
      const details = googleUser?.error_description || googleUser?.error || "Failed to fetch Google profile";
      return res.status(400).send(`Authentication failed: ${details}`);
    }

    let { data: user, error: userLookupError } = await supabase
      .from("users")
      .select("*")
      .eq("email", googleUser.email)
      .single();

    if (userLookupError && userLookupError.code !== "PGRST116") {
      throw userLookupError;
    }

    if (!user) {
      // Fallback to minimal insert if legacy schema doesn't include password_hash yet.
      const newUserId = randomUUID();
      let insertResult = await supabase
        .from("users")
        .insert({ id: newUserId, email: googleUser.email, password_hash: "OAUTH_USER" })
        .select()
        .single();

      if (insertResult.error && isMissingColumnError(insertResult.error, "password_hash")) {
        insertResult = await supabase
          .from("users")
          .insert({ id: newUserId, email: googleUser.email })
          .select()
          .single();
      }

      if (insertResult.error && isUsersIdFkError(insertResult.error)) {
        try {
          const authUserId = await ensureAuthUserIdForEmail(googleUser.email);
          let authInsert = await supabase
            .from("users")
            .insert({ id: authUserId, email: googleUser.email, password_hash: "OAUTH_USER" })
            .select()
            .single();
          if (authInsert.error && isMissingColumnError(authInsert.error, "password_hash")) {
            authInsert = await supabase
              .from("users")
              .insert({ id: authUserId, email: googleUser.email })
              .select()
              .single();
          }
          insertResult = authInsert;
        } catch (authError: any) {
          console.warn(
            "Supabase auth.admin create/list user failed; keeping OAuth fallback path:",
            authError?.message || authError
          );
        }
      }

      if (insertResult.error) {
        console.warn(
          "Falling back to OAuth-only session because public.users insert failed:",
          insertResult.error.message
        );
        user = {
          id: stableUuidFromString(`oauth:${googleUser.sub || googleUser.email}`),
          email: googleUser.email,
          plan_type: "free",
        };
      } else {
        user = insertResult.data;
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: googleUser.name || null,
        picture: googleUser.picture || null,
      },
      JWT_SECRET
    );
    res.cookie("token", token, getCookieOptions(req));

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Google OAuth callback failed:", err);
    const details = err?.message || "Internal server error";
    res.status(500).send(`Authentication failed: ${details}`);
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const hash = await bcrypt.hash(password, 10);
    let { data: user, error } = await supabase
      .from("users")
      .insert({ id: randomUUID(), email, password_hash: hash })
      .select()
      .single();

    if (error) {
      if (isUsersIdFkError(error)) {
        const authUserId = await ensureAuthUserIdForEmail(email);
        const retry = await supabase
          .from("users")
          .insert({ id: authUserId, email, password_hash: hash })
          .select()
          .single();
        user = retry.data;
        error = retry.error;
      }
      if (isMissingColumnError(error, "password_hash")) {
        return res.status(500).json({
          error:
            "Database schema is outdated: missing users.password_hash. Run supabase/init.sql.",
        });
      }
      if (error.code === "23505") return res.status(400).json({ error: "Email already exists" });
      throw error;
    }

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET);
    res.cookie("token", token, getCookieOptions(req));
    res.json({ user: { id: user.id, email } });
  } catch (err: any) {
    console.error("Signup failed:", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error) {
    if (isMissingColumnError(error, "password_hash")) {
      return res.status(500).json({
        error:
          "Database schema is outdated: missing users.password_hash. Run supabase/init.sql.",
      });
    }
    return res.status(500).json({ error: `Database error: ${error.message}` });
  }

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
  res.cookie("token", token, getCookieOptions(req));
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/api/auth/me", async (req: any, res) => {
  if (!req.user) return res.json({ user: null });
  let { data: user, error } = await supabase
    .from("users")
    .select("id, email, plan_type")
    .eq("id", req.user.id)
    .single();
  if (error && isMissingColumnError(error, "plan_type")) {
    const fallback = await supabase
      .from("users")
      .select("id, email")
      .eq("id", req.user.id)
      .single();
    user = fallback.data ? { ...fallback.data, plan_type: "free" } : null;
    error = fallback.error;
  }
  if (error) {
    console.warn("Falling back to token user for /api/auth/me:", error.message);
    return res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name || null,
        avatarUrl: req.user.picture || null,
        plan_type: "free",
      },
    });
  }
  res.json({
    user: {
      id: user?.id || req.user.id,
      email: user?.email || req.user.email,
      name: req.user.name || null,
      avatarUrl: req.user.picture || null,
      plan_type: user?.plan_type || "free",
    },
  });
});

app.get("/api/links/check-slug", async (req, res) => {
  const slugParam = typeof req.query.slug === "string" ? req.query.slug : "";
  const slug = normalizeSlug(slugParam);
  const validationError = validateSlug(slug);
  if (validationError) {
    return res.status(400).json({ available: false, error: validationError });
  }

  const { data, error } = await supabase
    .from("links")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ available: false, error: "Failed to check slug" });
  }

  return res.json({ available: !data });
});

// Links
app.post("/api/links", async (req: any, res) => {
  const { longUrl, customSlug } = req.body;
  const normalizedLongUrl = normalizeLongUrl(longUrl);
  if (!normalizedLongUrl) return res.status(400).json({ error: "Valid URL required" });

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const userId = await resolveAppUserId(req);
  
  let planType = "free";
  if (userId) {
    const { data: user } = await supabase
      .from("users")
      .select("plan_type")
      .eq("id", userId)
      .single();
    planType = user?.plan_type || "free";
  }

  // Check IP usage first
  const ipUsage = await checkUsage(`ip:${ip}`);
  
  if (userId) {
    const userUsage = await checkUsage(`user:${userId}`);
    if (!userUsage.allowed && !ipUsage.allowed) {
      return res.status(403).json({ error: "Daily limit reached", limitReached: true });
    }
    if (userUsage.allowed) {
      await incrementUsage(`user:${userId}`);
    } else {
      await incrementUsage(`ip:${ip}`);
    }
  } else {
    if (!ipUsage.allowed) {
      return res.status(403).json({ error: "Daily limit reached", limitReached: true });
    }
    await incrementUsage(`ip:${ip}`);
  }

  const requestedSlug =
    typeof customSlug === "string" && customSlug.trim().length > 0
      ? normalizeSlug(customSlug)
      : "";
  if (requestedSlug) {
    const validationError = validateSlug(requestedSlug);
    if (validationError) return res.status(400).json({ error: validationError });
  }
  const slug = requestedSlug || nanoid(7);
  
  let { data: newLink, error } = await supabase
    .from("links")
    .insert({ user_id: userId || null, slug, long_url: normalizedLongUrl })
    .select()
    .single();

  if (error && isLinksUserIdFkError(error)) {
    const retry = await supabase
      .from("links")
      .insert({ user_id: null, slug, long_url: normalizedLongUrl })
      .select()
      .single();
    newLink = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("Create link failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505") return res.status(400).json({ error: "Custom slug already taken" });
    return res.status(500).json({ error: error.message || "Failed to create link" });
  }
  
  res.json({ slug, shortUrl: `${getBaseUrl(req)}/${slug}` });
});

app.patch("/api/links/:id", async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { longUrl } = req.body;
  const { id } = req.params;
  const userId = await resolveAppUserId(req);
  const normalizedLongUrl = normalizeLongUrl(longUrl);
  if (!normalizedLongUrl) return res.status(400).json({ error: "Valid URL required" });

  let error: any = null;

  if (id.startsWith("local-")) {
    const slug = id.slice("local-".length);
    const result = await supabase
      .from("links")
      .update({ long_url: normalizedLongUrl })
      .eq("slug", slug);
    error = result.error;
  } else {
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await supabase
      .from("links")
      .update({ long_url: normalizedLongUrl })
      .eq("id", id)
      .eq("user_id", userId);
    error = result.error;
  }

  if (error) return res.status(404).json({ error: "Link not found" });
  res.json({ success: true });
});

app.delete("/api/links/:id", async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.params;
  const userId = await resolveAppUserId(req);

  let error: any = null;

  if (id.startsWith("local-")) {
    const slug = id.slice("local-".length);
    const result = await supabase.from("links").delete().eq("slug", slug);
    error = result.error;
  } else {
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await supabase
      .from("links")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    error = result.error;
  }

  if (error) return res.status(404).json({ error: "Link not found" });
  res.json({ success: true });
});

app.get("/api/links", async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const userId = await resolveAppUserId(req);
  if (!userId) return res.json({ links: [] });
  const { data: links } = await supabase
    .from("links")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  res.json({ links: links || [] });
});

// Redirect Route (Must be before Vite middleware)
app.get("/:slug", async (req, res, next) => {
  const slug = String(req.params.slug || "");
  const slugLower = slug.toLowerCase();
  if (!slug || slug.includes(".") || RESERVED_SLUGS.has(slugLower)) return next();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) return next();

  const { data: link } = await supabase
    .from("links")
    .select("id, long_url, clicks")
    .eq("slug", slug)
    .single();

  if (link) {
    await supabase
      .from("links")
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq("id", link.id);
    res.set("Cache-Control", "no-store");
    return res.redirect(302, link.long_url);
  }

  res.status(404).send(`
    <html>
      <head>
        <title>Link Unavailable</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f1f5f9;
            color: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 16px;
          }
          .card {
            max-width: 520px;
            width: 100%;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
          }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 0; color: #475569; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>This link is no longer available</h1>
          <p>This short link was deleted by the user or is no longer active.</p>
        </div>
      </body>
    </html>
  `);
});

// Vite Integration
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
