import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
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
        {/* pb clears the floating mobile nav; removed on md+ where the sidebar is shown */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0">{children}</div>
        <AppFooter />
      </main>
      <MobileNav />
    </div>
  );
}
