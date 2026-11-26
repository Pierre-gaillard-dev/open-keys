import type { Transcriptions } from "@open-keys/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTranscriptions, submitTranscription, submitTranscriptionUrl } from "./transcriptions.api";

const transcriptionsKey = ["transcriptions"] as const;
/** While a recording is waiting or being transcribed, the list is refreshed this often. */
const POLL_MS = 5000;

const inProgress = (data: Transcriptions | undefined) =>
  data?.jobs.some((job) => job.status === "queued" || job.status === "running") ?? false;

export function useTranscriptions() {
  return useQuery({
    queryKey: transcriptionsKey,
    queryFn: fetchTranscriptions,
    refetchInterval: (query) => (inProgress(query.state.data) ? POLL_MS : false),
  });
}

export function useSubmitTranscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, durationS }: { file: File; durationS: number | null }) =>
      submitTranscription(file, durationS),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transcriptionsKey }),
  });
}

export function useSubmitTranscriptionUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => submitTranscriptionUrl({ url }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transcriptionsKey }),
  });
}
