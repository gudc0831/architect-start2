import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  assertSupabaseAnonKey,
  assertSupabaseServiceRoleKey,
  assertSupabaseUrl,
} from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(assertSupabaseUrl(), assertSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
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
