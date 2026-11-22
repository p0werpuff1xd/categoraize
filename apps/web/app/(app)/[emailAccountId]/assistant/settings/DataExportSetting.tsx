"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastSuccess } from "@/components/Toast";

/** "Download my data" (RA 10173): a JSON file without tokens or email bodies. */
export function DataExportSetting() {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch("/api/user/data-export");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? `Download failed (HTTP ${response.status})`,
        );
      }
      const name =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "categoraize-data.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toastSuccess({ description: "Your data was downloaded." });
    } catch (error) {
      toastError({
        description: error instanceof Error ? error.message : "Download failed",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SettingCard
      title="Download my data"
      description="A JSON file with your labels, analysis results, contacts, corrections, consent history and security log. It does not include access tokens or the text of your emails. Up to 3 downloads an hour."
      right={
        <Button
          variant="outline"
          size="sm"
          onClick={download}
          loading={downloading}
          disabled={downloading}
        >
          <DownloadIcon className="mr-1 size-4" aria-hidden />
          Download
        </Button>
      }
    />
  );
}
