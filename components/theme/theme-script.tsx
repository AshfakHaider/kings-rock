export function ThemeScript() {
  const script = `
    try {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } catch {}
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
