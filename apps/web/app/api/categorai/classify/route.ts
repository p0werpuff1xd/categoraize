import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { classifyWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { classifyRequest } from "./validation";

export const POST = withEmailAccount("categorai/classify", async (request) => {
  const body = classifyRequest.parse(await request.json());
  const result = await classifyWithIntelligenceService({
    email_vector: body.emailVector,
    categories: body.categories,
    threshold: body.threshold,
    subject: body.subject,
    body: body.body,
    message_at: body.messageAt,
    timezone: body.timezone,
    priority_factors: body.priorityFactors,
  });

  return NextResponse.json(result);
});
