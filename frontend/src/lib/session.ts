/** Session cache: one ["session"] query, wiped at every sign-out so no data leaks across accounts. */
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { queryClient } from "./queryClient";
import type { User } from "./types";

export const SESSION_KEY = ["session"];

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  return { user: query.data ?? null, isLoading: query.isLoading };
}

/** Call after a successful login/signup/register — refreshes the cached session. */
export async function beginSession() {
  queryClient.clear();
  await queryClient.fetchQuery({ queryKey: SESSION_KEY, queryFn: () => apiGet<User>("/auth/me") });
}

/** Every sign-out control must await this — clearing only the server session would leak
 * the previous account's react-query cache to the next login on this browser. */
export async function endSession() {
  try {
    await apiPost("/auth/logout");
  } catch {
    // session may already be gone; clearing local state is what matters
  }
  queryClient.clear();
}