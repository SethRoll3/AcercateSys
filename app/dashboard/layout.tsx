'use client'

import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useCallback } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { RoleProvider, UserRole } from "@/contexts/role-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter()

  const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
  const readCache = (key: string) => {
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) return null
      const obj = JSON.parse(raw)
      if (!obj || typeof obj.ts !== 'number') return null
      if (Date.now() - obj.ts > CACHE_TTL_MS) return null
      return obj.data ?? null
    } catch {}
    return null
  }
  const writeCache = (key: string, data: any) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch {}
  }

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
        const cached = readCache('dashboard:userData')
        if (cached && cached.id) {
          setUserRole(cached.role)
          setUserEmail(cached.email)
        }

        // Si no hay cache, intentar recuperar con Supabase
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Buscar perfil
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('auth_id', user.id)
            .maybeSingle()
          
          if (profile) {
             setUserRole(profile.role)
             setUserEmail(profile.email)
             writeCache('dashboard:userData', profile)
             return
          }
        }

        router.push("/auth/login");
        return;
      } catch (error) {
        console.error('[DashboardLayout] fetchUserData: Error al obtener datos del usuario:', error);
        router.push("/auth/login");
      }
    };

    fetchUserData();
    const onFocus = () => { fetchUserData() }
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchUserData() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchWithTimeout, router]);

  return (
    <RoleProvider>
      <div className="flex h-screen bg-background">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <img
              src="/logoCooperativaTextoSinFondo.png"
              alt="Watermark"
              className="h-1/2 w-1/2 object-contain opacity-25"
            />
          </div>
          <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden z-10 relative">
            <DashboardHeader userRole={userRole ?? ""} userEmail={userEmail ?? ""} />
            <main className="flex-1 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
              <Suspense fallback={<LoadingSpinner />}>
                {children}
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </RoleProvider>
  );
}
