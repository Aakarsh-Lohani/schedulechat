import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  return <>{children}</>;
}
