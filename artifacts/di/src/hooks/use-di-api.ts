import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchApi,
  uploadDataset,
  OverviewData,
  AnswerData,
  BriefingData,
  ChangesData,
  ScanData,
  DatasetData,
  DatasetDetailData,
} from "@/lib/api";

export function useOverview() {
  return useQuery({
    queryKey: ["di", "overview"],
    queryFn: () => fetchApi<OverviewData>("/api/di/overview"),
  });
}

export function useDatasets() {
  return useQuery({
    queryKey: ["di", "datasets"],
    queryFn: () => fetchApi<DatasetData[]>("/api/di/datasets"),
  });
}

export function useDatasetDetail(id: number | null) {
  return useQuery({
    queryKey: ["di", "datasets", id],
    queryFn: () => fetchApi<DatasetDetailData>(`/api/di/datasets/${id}`),
    enabled: id !== null && id > 0,
  });
}

export function useUploadDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "datasets"] });
      queryClient.invalidateQueries({ queryKey: ["di", "overview"] });
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/di/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di"] });
    },
  });
}

export function useSuggestions(datasetId: number | null) {
  return useQuery({
    queryKey: ["di", "suggestions", datasetId],
    queryFn: () =>
      fetchApi<{ suggestions: string[] }>(
        datasetId ? `/api/di/suggestions?datasetId=${datasetId}` : "/api/di/suggestions",
      ),
  });
}

export function useAskHistory(datasetId: number | null) {
  return useQuery({
    queryKey: ["di", "ask", "history", datasetId],
    queryFn: () =>
      fetchApi<AnswerData[]>(
        datasetId ? `/api/di/ask/history?datasetId=${datasetId}` : "/api/di/ask/history",
      ),
  });
}

export function useAsk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { question: string; datasetId?: number }) =>
      fetchApi<AnswerData>("/api/di/ask", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "ask", "history"] });
      queryClient.invalidateQueries({ queryKey: ["di", "overview"] });
    },
  });
}

export function useDeleteAskHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/di/ask/history/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "ask", "history"] });
    },
  });
}

export function useBriefings(datasetId: number | null) {
  return useQuery({
    queryKey: ["di", "briefings", datasetId],
    queryFn: () =>
      fetchApi<BriefingData[]>(
        datasetId ? `/api/di/briefings?datasetId=${datasetId}` : "/api/di/briefings",
      ),
  });
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { datasetId?: number }) =>
      fetchApi<BriefingData>("/api/di/briefings/generate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "briefings"] });
      queryClient.invalidateQueries({ queryKey: ["di", "overview"] });
    },
  });
}

export function useDeleteBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/di/briefings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "briefings"] });
    },
  });
}

export function useChanges(datasetId: number | null) {
  return useQuery({
    queryKey: ["di", "changes", datasetId],
    queryFn: () =>
      fetchApi<ChangesData>(
        datasetId ? `/api/di/changes?datasetId=${datasetId}` : "/api/di/changes",
      ),
  });
}

export function useScanChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { datasetId?: number }) =>
      fetchApi<ScanData>("/api/di/changes/scan", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["di", "changes"] });
      queryClient.invalidateQueries({ queryKey: ["di", "overview"] });
    },
  });
}
