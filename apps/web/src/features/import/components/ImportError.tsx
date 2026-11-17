import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError } from "../../../shared/api";
import { ErrorBanner } from "../../../shared/ui";

const conflictDetailsSchema = z.object({ songId: z.string(), title: z.string().optional() });

/** 409: the file is already in the catalogue — offer to open it instead of an error. */
export function ImportError({ error }: { readonly error: unknown }) {
  const duplicate =
    error instanceof ApiError && error.code === "CONFLICT"
      ? conflictDetailsSchema.safeParse(error.details)
      : undefined;
  if (duplicate?.success) {
    return (
      <div
        role="status"
        className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-2 p-4 text-sm"
      >
        <p className="font-semibold">Ce fichier est déjà dans ton catalogue</p>
        {duplicate.data.title && (
          <p className="text-fg-muted">« {duplicate.data.title} » a la même empreinte.</p>
        )}
        <Link
          to="/songs/$songId"
          params={{ songId: duplicate.data.songId }}
          className="py-1 font-semibold text-hand-left"
        >
          Ouvrir le morceau existant
        </Link>
      </div>
    );
  }
  return <ErrorBanner error={error} title="Import impossible" />;
}
