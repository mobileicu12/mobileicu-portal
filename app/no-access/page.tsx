import Link from "next/link";

export default async function NoAccess({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const { feature } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">🔒</div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">No access to this feature</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your account doesn&apos;t have permission to open{feature ? <> the <strong className="capitalize">{feature}</strong></> : " this"} section.
          Ask the owner to grant you access under <strong>Team &amp; access</strong>.
        </p>
        <Link href="/portal" className="mt-6 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
