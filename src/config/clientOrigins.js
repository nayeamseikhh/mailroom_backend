const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, "");

export function getClientOrigins(configuredOrigins) {
  const origins = configuredOrigins || "http://localhost:5173,https://mailroom-eight-beta.vercel.app";
  return new Set(
    origins
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean),
  );
}

export function isClientOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;

  try {
    const url = new URL(normalized);
    if (url.protocol === "https:" && /^mailroom.*\.vercel\.app$/.test(url.hostname)) {
      return true;
    }
  } catch {
    // ignore invalid URL format
  }

  return false;
}

