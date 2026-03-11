"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseAnonKey, assertSupabaseUrl } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  return createBrowserClient(assertSupabaseUrl(), assertSupabaseAnonKey());
}
