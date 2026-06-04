import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  assertSupabaseAnonKey,
  assertSupabaseServiceRoleKey,
  assertSupabaseUrl,
} from "@/lib/supabase/config";

type SupabaseServerClientOptions = {
  response?: NextResponse;
};

export async function createSupabaseServerClient(options: SupabaseServerClientOptions = {}) {
  const cookieStore = await cookies();

  return createServerClient(assertSupabaseUrl(), assertSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          options.response?.cookies.set(name, value, cookieOptions);

          try {
            cookieStore.set(name, value, cookieOptions);
          } catch {
            // Server Components may be read-only; middleware or route handlers will persist cookies.
          }
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  return createClient(assertSupabaseUrl(), assertSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
