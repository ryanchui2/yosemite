"use client";

import { useState } from "react";

interface AIExplanationCardProps {
  explanation: string;
}

export function AIExplanationCard({ explanation }: AIExplanationCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        {open ? "Hide" : "Show"} AI explanation
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded text-xs text-gray-700 leading-relaxed">
          {explanation}
        </div>
      )}
    </div>
  );
}
