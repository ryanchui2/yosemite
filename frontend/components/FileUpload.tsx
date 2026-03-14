"use client";

import { useRef, useState } from "react";

interface FileUploadProps {
  label: string;
  hint: string;
  onUpload: (file: File) => void;
  loading: boolean;
}

export function FileUpload({ label, hint, onUpload, loading }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFile(file: File) {
    setSelectedFile(file);
    onUpload(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-xs text-gray-400 mb-4">{hint}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {loading ? (
          <p className="text-sm text-gray-500">Scanning…</p>
        ) : selectedFile ? (
          <div>
            <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
            <p className="text-xs text-gray-400 mt-1">Click or drop to replace</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500">Drop CSV here or click to browse</p>
          </div>
        )}
      </div>
    </div>
  );
}
