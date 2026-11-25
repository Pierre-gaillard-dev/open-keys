import type { TranscriptionError, TranscriptionJob } from "@open-keys/contracts";

/**
 * Transcription takes about twice the recording's length on a 4-core CPU (spike D34); a little more
 * on a small server: the estimate stays on the safe side.
 */
export const SECONDS_PER_SECOND_OF_AUDIO = 2.5;

/** Minutes left for a job being transcribed, rounded up; null without its duration. */
export function minutesLeft(job: TranscriptionJob, now: number): number | null {
  if (job.status !== "running" || job.durationS === null || job.startedAt === null) {
    return null;
  }
  const totalS = job.durationS * SECONDS_PER_SECOND_OF_AUDIO;
  const elapsedS = (now - job.startedAt) / 1000;
  return Math.max(1, Math.ceil((totalS - elapsedS) / 60));
}

const ERRORS: Readonly<Record<TranscriptionError, string>> = {
  unreadable: "Fichier illisible : ce n'est pas un enregistrement audio, ou son format n'est pas reconnu.",
  no_notes: "Aucune note de piano trouvée dans l'enregistrement.",
  too_long: "Enregistrement trop long.",
  unreachable: "Enregistrement introuvable à son adresse : vérifie le lien, ou réessaie plus tard.",
  failed: "La transcription a échoué. Réessaie, ou essaie un autre fichier.",
};

/** One line about where a transcription is. */
export function statusText(job: TranscriptionJob, now: number): string {
  switch (job.status) {
    case "queued":
      return job.queuePosition ? `En attente (${job.queuePosition} avant)` : "En attente, c'est la prochaine";
    case "running": {
      const left = minutesLeft(job, now);
      return left === null
        ? "Transcription en cours…"
        : `Transcription en cours, environ ${left} min restantes`;
    }
    case "done":
      return "Transcrit : à vérifier avant l'ajout au catalogue";
    case "failed":
      return ERRORS[job.error ?? "failed"];
  }
}

/** Duration of an audio file (seconds), read by the browser; null when it cannot tell. */
export function audioDuration(file: File, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (duration: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
