export function isVercelQueueDispatchEnabled() {
  // Vercel Queues require a Pro/Enterprise plan. On Hobby the send() call
  // fails and falls through to the QStash/internal path, wasting time and
  // logging a spurious error on every enqueue. Respect an explicit opt-out.
  if (process.env.DISABLE_VERCEL_QUEUES === "true") return false;
  return process.env.VERCEL === "1";
}
