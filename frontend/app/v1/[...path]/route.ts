import { handleV1 } from "@/lib/api-routes";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return handleV1(req, path);
}

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return handleV1(req, path);
}

export const maxDuration = 300;
