'use client'

import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { createClient } from "@/lib/supabase/client";
import { redirect } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";

export default function LoansLayout({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        redirect("/auth/login");
      }

      const { data: userData } = await supabase.from("users").select("*").eq("auth_id", user.id).single();

      if (!userData) {
        redirect("/auth/login");
      }

      setUserRole(userData.role);
      setUserEmail(userData.email);
    };

    fetchUser();
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <DashboardHeader userRole={userRole ?? ""} userEmail={userEmail ?? ""} />
        <main className="flex-1 p-4 md:p-8">
          <Suspense fallback={<LoadingSpinner />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}