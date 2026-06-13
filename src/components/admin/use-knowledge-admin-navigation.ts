"use client";

import type { Route } from "next";
import {
  type KnowledgeAdminNavigation,
  serializeKnowledgeAdminNavigation,
} from "@/components/admin/knowledge-admin-tabs";

export function createKnowledgeAdminNavigationHref(
  pathname: string,
  searchParams: URLSearchParams,
  next: Partial<KnowledgeAdminNavigation>,
): Route {
  const query = serializeKnowledgeAdminNavigation(new URLSearchParams(searchParams.toString()), next);
  return (query ? `${pathname}?${query}` : pathname) as Route;
}
