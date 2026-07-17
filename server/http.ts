export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestError(415, "请求必须使用 JSON 格式");
  }

  try {
    return await request.json();
  } catch {
    throw new RequestError(400, "JSON 格式无效");
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new RequestError(403, "请求来源无效");
  }
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: "请求方法不受支持" },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function handleApiError(error: unknown): Response {
  if (error instanceof RequestError) {
    return errorResponse(error.status, error.message);
  }
  console.error(error);
  return errorResponse(500, "服务器暂时不可用");
}
