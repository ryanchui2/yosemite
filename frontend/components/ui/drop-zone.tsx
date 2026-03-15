"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

interface DropZoneProps {
  hint: string;
  onFile: (f: File) => void;
  onRemove?: () => void;
  fileName?: string;
  accept?: string;
}

/** Compact drag-and-drop upload zone */
export function DropZone({
  hint,
  onFile,
  onRemove,
  fileName,
  accept = ".csv,.pdf",
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="relative">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border border-border px-4 py-5 text-center cursor-pointer transition-all ${dragging ? "border-foreground bg-accent" : "hover:border-foreground/40"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {fileName ? (
          <div className="pr-4">
            <p className="text-xs font-medium text-foreground truncate font-mono">
              {fileName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drop to replace
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Drop CSV/PDF or click to browse
            </p>
            <p className="text-[11px] text-muted-foreground/60">{hint}</p>
          </div>
        )}
      </div>
      {fileName && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1.5 right-1.5 h-5 w-5 border border-border hover:border-foreground/40 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
          title="Remove file"
        >
          <span className="text-[10px] font-bold leading-none">✕</span>
        </button>
      )}
    </div>
  );
}
