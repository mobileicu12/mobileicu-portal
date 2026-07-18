export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="hidden shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface px-8 py-2.5 text-xs text-muted md:flex">
      <span>© {year} MOBILE ICU. All rights reserved.</span>
      <span className="text-muted/70">Developed &amp; managed by Kuldeep J @ RD-IT-Lab</span>
    </footer>
  );
}
