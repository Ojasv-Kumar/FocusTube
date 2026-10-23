/* The manifest content-script entry is classic; this starts the packaged ES module tree. */
try {
  if (document.documentElement) document.documentElement.dataset.focustubeMode = "startup";
  import(chrome.runtime.getURL("src/content/main.js")).catch(error => {
    try { console.warn("[FocusTube][loader] Could not start extension modules.", error?.name || "error"); } catch { /* page remains untouched */ }
    try { document.documentElement?.removeAttribute("data-focustube-mode"); } catch { /* ignored */ }
  });
} catch (error) {
  try { console.warn("[FocusTube][loader] FocusTube could not initialize.", error?.name || "error"); } catch { /* page remains untouched */ }
  try { document.documentElement?.removeAttribute("data-focustube-mode"); } catch { /* ignored */ }
}
