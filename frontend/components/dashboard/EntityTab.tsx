"use client";

import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { Users } from "lucide-react";

export interface EntityRow {
  description: string;
  country: string;
}

interface EntityTabProps {
  entityFileName: string | undefined;
  onFile: (f: File) => void;
  onRemoveFile: () => void;
  uploadedEntities: EntityRow[];
  manualInput: { description: string; country: string };
  setManualInput: React.Dispatch<
    React.SetStateAction<{ description: string; country: string }>
  >;
  onAddEntity: () => void;
  onRemoveEntity: (i: number) => void;
  manualEntities: EntityRow[];
  saveEntityLogName: string;
  setSaveEntityLogName: (s: string) => void;
  entitySaveLoading: boolean;
  onSaveEntityList: () => void;
  entitySaveMessage: string | null;
}

export function EntityTab({
  entityFileName,
  onFile,
  onRemoveFile,
  uploadedEntities,
  manualInput,
  setManualInput,
  onAddEntity,
  onRemoveEntity,
  manualEntities,
  saveEntityLogName,
  setSaveEntityLogName,
  entitySaveLoading,
  onSaveEntityList,
  entitySaveMessage,
}: EntityTabProps) {
  const totalEntities = uploadedEntities.length + manualEntities.length;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border p-6 space-y-4">
        <p className="text-sm font-semibold text-foreground">Entity list</p>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
          Upload a CSV or add entities manually. Then run sanctions and geo scan in the <strong>Geo &amp; Sanctions</strong> tab.
        </p>

        <DropZone
          hint="description, country"
          onFile={onFile}
          onRemove={onRemoveFile}
          fileName={entityFileName}
        />

        {uploadedEntities.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center font-mono">
            {uploadedEntities.length} entit{uploadedEntities.length !== 1 ? "ies" : "y"} from file
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            or add individually
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <input
              type="text"
              value={manualInput.description}
              onChange={(e) =>
                setManualInput((p) => ({ ...p, description: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddEntity();
              }}
              placeholder="Entity name"
              className="border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors min-w-0"
            />
            <input
              type="text"
              value={manualInput.country}
              onChange={(e) =>
                setManualInput((p) => ({ ...p, country: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddEntity();
              }}
              placeholder="Country"
              className="w-20 border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors"
            />
            <button
              onClick={onAddEntity}
              disabled={!manualInput.description.trim()}
              className="h-8 w-8 border border-foreground bg-foreground text-background hover:bg-foreground/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              title="Add entity"
            >
              <span className="text-base leading-none font-light">+</span>
            </button>
          </div>

          {manualEntities.length > 0 && (
            <div className="border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent text-muted-foreground uppercase tracking-wider">
                    <th className="px-3 py-2 text-left font-medium">Entity</th>
                    <th className="px-3 py-2 text-left font-medium">Country</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {manualEntities.map((e, i) => (
                    <tr key={i} className="hover:bg-accent/50 transition-colors">
                      <td className="px-3 py-2 font-medium text-foreground truncate max-w-[120px]">
                        {e.description}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {e.country || (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => onRemoveEntity(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalEntities > 0 && (
          <div className="space-y-2">
            <input
              type="text"
              value={saveEntityLogName}
              onChange={(e) => setSaveEntityLogName(e.target.value)}
              placeholder="Name this list (optional)"
              className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground transition-colors"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              disabled={entitySaveLoading}
              onClick={onSaveEntityList}
            >
              {entitySaveLoading ? "Saving..." : "Save entity list"}
            </Button>
          </div>
        )}
        {entitySaveMessage && (
          <p
            className={`text-[11px] font-mono text-center ${entitySaveMessage.startsWith("Saved") ? "text-green-600" : "text-destructive"}`}
          >
            {entitySaveMessage}
          </p>
        )}
      </div>

      {totalEntities > 0 && (
        <div className="border border-border bg-card">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
              Entity data ({totalEntities} {totalEntities === 1 ? "entity" : "entities"})
            </span>
          </div>
          <div className="p-6 overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-accent text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Entity</th>
                  <th className="px-3 py-2 text-left font-medium">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...uploadedEntities, ...manualEntities].map((e, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[280px]">
                      {e.description}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.country || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
