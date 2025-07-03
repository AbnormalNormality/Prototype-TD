const tsLoader = document.createElement("script");
tsLoader.src =
  "https://cdn.jsdelivr.net/npm/typescript@5.3.3/lib/typescript.min.js";

tsLoader.onload = async () => {
  for (const tss of document.querySelectorAll("script")) {
    if (tss.type !== "text/typescript") continue;
    const response = await fetch(tss.src);
    const tsCode = await response.text();

    const jsResult = window.ts.transpileModule(tsCode, {
      compilerOptions: {
        module: window.ts.ModuleKind.ES2020,
        target: window.ts.ScriptTarget.ES2020,
      },
    });

    const blob = new Blob([jsResult.outputText], {
      type: "application/javascript",
    });

    const moduleUrl = URL.createObjectURL(blob);
    await import(moduleUrl);
  }
};

document.body.appendChild(tsLoader);
