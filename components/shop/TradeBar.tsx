"use client";

export default function TradeBar() {
  async function logout() {
    await fetch("/api/shop/trade-logout", { method: "POST" });
    window.location.reload();
  }
  return (
    <div className="bg-emerald-600 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 text-xs font-medium sm:px-6">
        <span>✓ Trade pricing active — you&apos;re seeing your wholesale prices.</span>
        <button onClick={logout} className="rounded-full bg-white/15 px-3 py-0.5 font-semibold hover:bg-white/25">Log out</button>
      </div>
    </div>
  );
}
