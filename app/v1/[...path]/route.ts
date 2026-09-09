import { handleV1 } from "@/lib/api-routes";

type Ctx = { params: Promise<{ path: string[] }> };

async function run(req: Request, ctx: Ctx) {
  try {
    const { path } = await ctx.params;
    return await handleV1(req, path);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ detail }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: Ctx) {
  return run(req, ctx);
}

export async function POST(req: Request, ctx: Ctx) {
  return run(req, ctx);
}

export const runtime = "nodejs";
export const maxDuration = 300;
