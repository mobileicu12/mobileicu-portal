import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";
import TodaySendDrawer from "@/components/TodaySendDrawer";
import { getSettings } from "@/lib/settings";
import { shopifyConfigured } from "@/lib/shopify";

// Cache the tap-in flag so the gate doesn't hit Shopify on every page load.
const cachedRequireTapIn = unstable_cache(
  async () => { try { return (await getSettings()).requireTapIn; } catch { return false; } },
  ["require-tap-in-flag"],
  { revalidate: 60 },
);

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Owner-toggleable staff tap-in gate. Fast path: already tapped in today → no work.
  const path = (await headers()).get("x-pathname") || "";
  let needTapIn = false;
  if (shopifyConfigured() && path.startsWith("/portal") && path !== "/portal/tap-in") {
    const today = new Date().toISOString().slice(0, 10);
    const tappedIn = (await cookies()).get("mi_tapin")?.value === today;
    if (!tappedIn && (await cachedRequireTapIn())) needTapIn = true;
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
