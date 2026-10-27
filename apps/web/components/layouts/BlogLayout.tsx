export function BlogLayout(props: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50">
      <main className="isolate">{props.children}</main>
    </div>
  );
}
