import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { backendMode, defaultProjectName } = await import("../src/lib/runtime-config");

  if (backendMode !== "cloud") {
    throw new Error("bootstrap-admin requires APP_BACKEND_MODE=cloud");
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requireEnv("BOOTSTRAP_ADMIN_EMAIL");
  const password = requireEnv("BOOTSTRAP_ADMIN_PASSWORD");
  const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "Admin";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const existing = await findAuthUserByEmail(supabase, email);
  const authUser = existing ?? (await createAuthUser(supabase, email, password, displayName));

  const updateResult = await supabase.auth.admin.updateUserById(authUser.id, {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
    },
  });

  if (updateResult.error) {
    throw new Error(`Failed to update bootstrap admin user: ${updateResult.error.message}`);
  }

  await prisma.profile.upsert({
    where: { id: authUser.id },
    update: {
      email,
      displayName,
      role: "admin",
    },
    create: {
      id: authUser.id,
      email,
      displayName,
      role: "admin",
    },
  });

  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!project) {
    await prisma.project.create({
      data: {
        name: defaultProjectName,
        createdBy: authUser.id,
        updatedBy: authUser.id,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        admin: {
          id: authUser.id,
          email,
          displayName,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function findAuthUserByEmail(supabase: any, email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(`Failed to list Supabase users: ${error.message}`);
    }

    const users = data.users ?? [];
    const match = users.find((entry: { email?: string | null }) => entry.email?.toLowerCase() === email.toLowerCase());

    if (match) {
      return match;
    }

    if (users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function createAuthUser(
  supabase: any,
  email: string,
  password: string,
  displayName: string,
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Failed to create bootstrap admin user");
  }

  return data.user;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
