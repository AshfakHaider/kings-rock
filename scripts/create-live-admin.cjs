const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || "admin@kingsrock.com";
const password = process.env.ADMIN_PASSWORD || "admin123";
const name = process.env.ADMIN_NAME || "Kings Rock Admin";
const phone = process.env.ADMIN_PHONE || "+8801700000000";

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (password.length < 6) {
  console.error("ADMIN_PASSWORD must be at least 6 characters.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  let user = users.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone, role: "admin" }
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { name, phone, role: "admin" }
    });
    if (error) throw error;
    user = data.user;
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      auth_user_id: user.id,
      name,
      phone,
      email,
      role: "admin",
      status: "active",
      join_date: now.slice(0, 10),
      notes: "Live admin account",
      created_at: now
    },
    { onConflict: "email" }
  );

  if (profileError) throw profileError;
  console.log(`Admin ready: ${email}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
