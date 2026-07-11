export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-8 py-2.5 text-xs text-muted">
      <span>© {year} MOBILE ICU. All rights reserved.</span>
      <span className="text-muted/70">Control Portal</span>
    </footer>
  );
}
