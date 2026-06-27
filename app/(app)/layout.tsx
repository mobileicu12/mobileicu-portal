import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <AppHeader />
        {children}
      </main>
    </div>
  );
}
