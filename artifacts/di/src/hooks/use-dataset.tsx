import React, { createContext, useContext, useState, useEffect } from "react";
import { useDatasets } from "@/hooks/use-di-api";

type DatasetContextType = {
  selectedDatasetId: number | null;
  setSelectedDatasetId: (id: number | null) => void;
};

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const { data: datasets } = useDatasets();
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);

  useEffect(() => {
    // Auto-select a dataset if none is selected
    if (datasets && datasets.length > 0 && selectedDatasetId === null) {
      const builtin = datasets.find(d => d.sourceType === "builtin");
      if (builtin) {
        setSelectedDatasetId(builtin.id);
      } else {
        setSelectedDatasetId(datasets[0].id);
      }
    } else if (datasets && selectedDatasetId !== null) {
      // Ensure selected dataset still exists
      if (!datasets.find(d => d.id === selectedDatasetId)) {
        const builtin = datasets.find(d => d.sourceType === "builtin");
        setSelectedDatasetId(builtin ? builtin.id : (datasets.length > 0 ? datasets[0].id : null));
      }
    }
  }, [datasets, selectedDatasetId]);

  return (
    <DatasetContext.Provider value={{ selectedDatasetId, setSelectedDatasetId }}>
      {children}
    </DatasetContext.Provider>
  );
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset must be used within a DatasetProvider");
  }
  return context;
}
