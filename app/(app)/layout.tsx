import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";
import TodaySendDrawer from "@/components/TodaySendDrawer";
import { getSettings } from "@/lib/settings";
import { shopifyConfigured } from "@/lib/shopify";

// getSettings is cached at source (lib/settings), so the gate doesn't hit
// Shopify on every page load.
async function requireTapIn(): Promise<boolean> {
  try { return (await getSettings()).requireTapIn; } catch { return false; }
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Staff tap-in gate — DISABLED by default for performance. Set ENABLE_TAPIN=1 to
  // switch it back on (then it also respects the owner's requireTapIn setting).
  let needTapIn = false;
  let fromPath = "";
  if (process.env.ENABLE_TAPIN === "1") {
    const path = (await headers()).get("x-pathname") || "";
    fromPath = path;
    if (shopifyConfigured() && path.startsWith("/portal") && path !== "/portal/tap-in") {
      const today = new Date().toISOString().slice(0, 10);
      const tappedIn = (await cookies()).get("mi_tapin")?.value === today;
      if (!tappedIn && (await requireTapIn())) needTapIn = true;
    }
  }
  if (needTapIn) redirect(`/portal/tap-in?from=${encodeURIComponent(fromPath)}`); // redirect() must run outside try/catch

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader />
        {/* pb clears the floating mobile nav; removed on md+ where the sidebar is shown.
            pr keeps content clear of the "Today's sending" tab, which is fixed to the
            right edge — without it, whatever sits at the edge of a wide page (a table's
            last column, a collection's parent dropdown) ends up underneath it. */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0 md:pr-9">{children}</div>
        <AppFooter />
      </main>
      <MobileNav />
      <TodaySendDrawer />
    </div>
  );
}
