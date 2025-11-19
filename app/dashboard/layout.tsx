'use client'

import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { RoleProvider } from "@/contexts/role-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login")
        return
      }

      const { data: userData } = await supabase.from("users").select("*").eq("auth_id", user.id).single();

      if (!userData) {
        router.push("/auth/login")
        return
      }

      setUserRole(userData.role);
      setUserEmail(userData.email);
    };

    fetchUser();
  }, []);

  return (
    <RoleProvider>
      <div className="flex h-screen bg-background">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <DashboardHeader userRole={userRole ?? ""} userEmail={userEmail ?? ""} />
          <main className="flex-1 p-4 md:p-8">
            <Suspense fallback={<LoadingSpinner />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
