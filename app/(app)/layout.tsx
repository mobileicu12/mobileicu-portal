import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";
import TodaySendDrawer from "@/components/TodaySendDrawer";
import { getSettings } from "@/lib/settings";
import { shopifyConfigured } from "@/lib/shopify";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Owner-toggleable staff tap-in gate: signed-in users must tap in before the
  // portal opens. The cookie carries today's date and expires at auto tap-out.
  const path = (await headers()).get("x-pathname") || "";
  let needTapIn = false;
  if (shopifyConfigured() && path.startsWith("/portal") && path !== "/portal/tap-in") {
    try {
      const settings = await getSettings();
      if (settings.requireTapIn) {
        const today = new Date().toISOString().slice(0, 10);
        if ((await cookies()).get("mi_tapin")?.value !== today) needTapIn = true;
      }
    } catch { /* never let the gate hard-fail the whole portal */ }
  }
  if (needTapIn) redirect(`/portal/tap-in?from=${encodeURIComponent(path)}`); // redirect() must run outside try/catch

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
      <TodaySendDrawer />
    </div>
  );
}
