'use client'

import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useCallback } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { RoleProvider, UserRole } from "@/contexts/role-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter()

  const fetchWithTimeout = useCallback(async (url: string, options: RequestInit = {}, timeoutMs: number = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userApiResponse = await fetchWithTimeout('/api/auth/user', { credentials: 'include' as any }, 8000);

        if (!userApiResponse.ok) {
          router.push("/auth/login");
          return;
        }

        const apiUserData = await userApiResponse.json();

        if (!apiUserData || !apiUserData.id) {
          console.error('[DashboardLayout] fetchUserData: No hay datos de usuario o ID de usuario en la respuesta de la API.');
          router.push("/auth/login");
          return;
        }

        setUserRole(apiUserData.role);
        setUserEmail(apiUserData.email);
      } catch (error) {
        console.error('[DashboardLayout] fetchUserData: Error al obtener datos del usuario:', error);
        router.push("/auth/login");
      }
    };

    fetchUserData();
  }, [fetchWithTimeout, router]);

  return (
    <RoleProvider>
      <div className="flex h-screen bg-background">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <DashboardHeader userRole={userRole ?? ""} userEmail={userEmail ?? ""} />
          <main className="flex-1 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
            <Suspense fallback={<LoadingSpinner />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
