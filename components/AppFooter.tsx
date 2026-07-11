export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface px-8 py-2.5 text-xs text-muted">
      <span>© {year} MOBILE ICU. All rights reserved.</span>
      <span>
        Website &amp; portal developed &amp; managed by{" "}
        <span className="font-medium text-ink">Kuldeep J</span>
        <span className="text-muted/60"> · </span>
        <span className="font-medium text-accent">RD-IT-Lab</span>
      </span>
    </footer>
  );
}
