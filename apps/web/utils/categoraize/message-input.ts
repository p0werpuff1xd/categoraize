import type { CategoraizeEmailInput } from "@/utils/categoraize/process-email";
import { internalDateToDate } from "@/utils/date";
import { emailToContent } from "@/utils/mail";
import type { ParsedMessage } from "@/utils/types";

const MAX_BODY_CHARS = 8000;

export function categoraizeInputFromMessage(
  message: ParsedMessage,
): CategoraizeEmailInput {
  return {
    threadId: message.threadId,
    messageId: message.id,
    subject: message.headers.subject ?? "",
    from: message.headers.from ?? "",
    // The latest reply only, without the signature: that is where the request and deadline live.
    body: emailToContent(message, {
      maxLength: MAX_BODY_CHARS,
      extractReply: true,
      stripSignature: true,
    }),
    receivedAt: internalDateToDate(message.internalDate),
  };
}
