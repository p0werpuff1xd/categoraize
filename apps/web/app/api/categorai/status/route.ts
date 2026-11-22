import { NextResponse } from "next/server";
import { getCategoraizeServiceStatus } from "@/utils/categoraize/client";
import { withEmailAccount } from "@/utils/middleware";

export type CategoraizeStatusResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/status", async () =>
  NextResponse.json(await getData()),
);

async function getData() {
  return { status: await getCategoraizeServiceStatus() };
}
