import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../storage.js";
const $ = id => document.getElementById(id);
const status = $("status");
function tell(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
function theme(value) { document.documentElement.dataset.theme = value === "light" ? "light" : "dark"; }
function paint(settings) { $("hide-comments").checked = settings.hideCommentsInLearn; $("hide-subscriptions").checked = settings.hideSubscriptionsInLearn; $("theme").value = settings.theme; $("camera-enabled").checked = settings.cameraEnabled; $("camera-enabled").disabled = !settings.cameraCalibration; $("camera-state").textContent = settings.cameraCalibration ? "Camera permission and calibration are ready." : "Camera setup is not complete. Complete setup before enabling monitoring."; theme(settings.theme); }
function read() { return { hideCommentsInLearn: $("hide-comments").checked, hideSubscriptionsInLearn: $("hide-subscriptions").checked, theme: $("theme").value, cameraEnabled: $("camera-enabled").checked }; }
$("theme").addEventListener("change", () => theme($("theme").value));
$("camera-setup").addEventListener("click", () => { void chrome.tabs.create({ url: chrome.runtime.getURL("src/camera/setup.html") }); });
$("settings-form").addEventListener("submit", async event => { event.preventDefault(); try { const saved = await saveSettings(read()); paint(saved); tell("Settings saved. Open YouTube tabs update immediately."); } catch { tell("Could not save settings. Reload this page and try again.", true); } });
$("reset").addEventListener("click", async () => { try { await chrome.storage.local.clear(); const saved = await saveSettings(DEFAULT_SETTINGS); paint(saved); tell("Settings reset to defaults."); } catch { tell("Could not reset settings.", true); } });
try { paint(await getSettings()); tell("Settings loaded."); } catch { tell("Could not load settings.", true); }
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.cameraEnabled || changes.cameraCalibration)) void getSettings().then(paint); });
