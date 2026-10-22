import { redirect } from "next/navigation";

import LandingPage from "@/components/landing/LandingPage";
import { createServerSupabase } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/jobs");
  }

  return <LandingPage />;
}
