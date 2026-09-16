"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/fetcher";
import { useUIStore } from "@/lib/store/uiStore";

function handleGlobalError(error: unknown) {
  if (error instanceof ApiError) {
    useUIStore.getState().showError({
      error: error.message,
      code: error.code,
      status: error.status,
      raw: error.data,
    });
  } else if (error instanceof Error) {
    useUIStore.getState().showError({
      error: error.message,
    });
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => handleGlobalError(error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => handleGlobalError(error),
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

