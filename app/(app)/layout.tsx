import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader />
        <div className="flex-1 overflow-y-auto">{children}</div>
        <AppFooter />
      </main>
    </div>
  );
}
