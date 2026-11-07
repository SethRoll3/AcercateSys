import { RoleProvider } from '@/contexts/role-context'

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <RoleProvider>{children}</RoleProvider>
}
