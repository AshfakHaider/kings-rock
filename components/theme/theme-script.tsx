export function ThemeScript() {
  const script = `
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light") document.documentElement.classList.remove("dark");
      else document.documentElement.classList.add("dark");
    } catch {}
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
