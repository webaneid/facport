"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileDropzoneProps = {
  value: File | undefined;
  onChange: (file: File | undefined) => void;
  accept: string;
  hint: string;
  error?: boolean;
};

export function FileDropzone({ value, onChange, accept, hint, error }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onChange(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0])}
      />

      {!value ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragActive ? "border-primary-500 bg-primary-50" : "border-border hover:border-primary-400 hover:bg-muted",
            error && "border-destructive",
          )}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Klik untuk pilih file, atau seret file ke sini
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(value.size)}</p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            className="shrink-0 text-sm text-primary-600 underline hover:text-primary-700"
          >
            Ganti
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Hapus file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
