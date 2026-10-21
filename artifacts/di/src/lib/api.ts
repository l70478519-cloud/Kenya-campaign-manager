export type OverviewData = {
  datasets: number;
  datasetRows: number;
  questionsAnswered: number;
  briefings: number;
  lastSnapshotAt: string | null;
};

export type ColumnMeta = {
  key: string;
  label: string;
  type: "number" | "text" | "date";
};

export type DatasetData = {
  id: number;
  name: string;
  sector: string;
  description: string | null;
  sourceType: "builtin" | "upload";
  columns: ColumnMeta[];
  rowCount: number;
  createdAt: string;
};

export type DatasetDetailData = DatasetData & {
  preview: Array<Record<string, string | number>>;
};

export type AnswerData = {
  id: number;
  datasetId: number | null;
  question: string;
  status: "answered" | "unsupported";
  intent?: string;
  intentLabel?: string;
  chartType?: "bar" | "pie" | "table" | "stat";
  chartData?: Array<Record<string, string | number>>;
  chartMeta?: {
    xKey: string;
    yKeys: string[];
    valueLabel?: string;
  };
  explanation?: string;
  message?: string;
  suggestions?: string[];
  createdAt: string;
};

export type BriefingSection = {
  key: string;
  title: string;
  content: string;
};

export type BriefingData = {
  id: number;
  datasetId: number | null;
  title: string;
  sections: BriefingSection[];
  createdAt: string;
};

export type ChangeItem = {
  id: number;
  metric: string;
  label: string;
  previous: number;
  current: number;
  delta: number;
  severity: "high" | "medium" | "low";
  explanation: string;
  createdAt: string;
};

export type ScanData = {
  snapshotId: number;
  datasetId?: number;
  noNewData?: boolean;
  createdAt: string;
  changes: ChangeItem[];
};

export type ChangesData = {
  lastSnapshotAt: string | null;
  scans: ScanData[];
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(data?.error || response.statusText, response.status);
  }

  return data as T;
}

export async function uploadDataset(input: {
  file: File;
  name: string;
  sector: string;
  description?: string;
}): Promise<DatasetData> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("name", input.name);
  form.append("sector", input.sector);
  if (input.description) form.append("description", input.description);
  const response = await fetch("/api/di/datasets/upload", { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error || response.statusText, response.status);
  }
  return data as DatasetData;
}
