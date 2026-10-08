import { authConfig, getAuth } from "@/lib/auth/server";
import { authProxy } from "@/lib/auth/proxy";

type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return authProxy(request, path, (req, forwarded) => {
    const handlers = getAuth().handler();
    const method = req.method as keyof typeof handlers;
    return handlers[method](req, { params: Promise.resolve({ path: forwarded }) });
  }, authConfig().cookies.secret);
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as PATCH };

export const runtime = "nodejs";
