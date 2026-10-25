/**
 * Motion tuning for injected video surfaces. Keep these deliberately restrained
 * so the UI feels responsive without hurting scrolling or playback performance.
 */
export const MOTION_TUNING = Object.freeze({
  cardTiltDegrees: 4.2,       // Maximum card tilt on fine-pointer devices.
  cardLiftPixels: 4,          // CSS lift on hover.
  thumbnailParallaxPixels: 5, // Thumbnail drift while scrolling.
  heroParallaxPixels: 4,      // Hero copy drift while moving the pointer.
  magneticButtonStrength: 0.12, // Fraction of pointer offset transferred to buttons.
  pageSpotlightSize: 520,     // Spotlight diameter in CSS pixels.
  pageSpotlightOpacity: 0.075 // Maximum ambient spotlight opacity.
});

export function createHost(hostName, hostId) {
  try {
    const host = document.createElement(hostName);
    host.id = hostId;
    host.dataset.theme = document.documentElement?.dataset.focustubeTheme === "light" || document.documentElement?.dataset.theme === "light" ? "light" : "dark";
    const shadow = host.attachShadow({ mode: "open" });
    return { host, shadow };
  } catch { return null; }
}
export function addStyle(shadow, css) {
  const theme = `
    :host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;box-sizing:border-box}
    *,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
    :host([data-theme="dark"]){color:#f1f1f1;color-scheme:dark}
    :host([data-theme="dark"]) .wrap,:host([data-theme="dark"]) .dialog{background:#0f0f0f!important;color:#f1f1f1!important;border-color:#303030!important;box-shadow:none!important}
    :host([data-theme="dark"]) .card,:host([data-theme="dark"]) .channel,:host([data-theme="dark"]) .mode,:host([data-theme="dark"]) .control,:host([data-theme="dark"]) .panel,:host([data-theme="dark"]) .status,:host([data-theme="dark"]) .original,:host([data-theme="dark"]) .empty{background:#181818!important;color:#f1f1f1!important;border-color:#303030!important;box-shadow:none!important}
    :host([data-theme="dark"]) .title,:host([data-theme="dark"]) .role,:host([data-theme="dark"]) .sectionTitle,:host([data-theme="dark"]) .videoTitle,:host([data-theme="dark"]) .mode strong,:host([data-theme="dark"]) .channel strong,:host([data-theme="dark"]) .label,:host([data-theme="dark"]) .brand,:host([data-theme="dark"]) .eyebrow,:host([data-theme="dark"]) .progressLabel{color:#f1f1f1!important}
    :host([data-theme="dark"]) .intro,:host([data-theme="dark"]) .query,:host([data-theme="dark"]) .meta,:host([data-theme="dark"]) .reason,:host([data-theme="dark"]) .confidence,:host([data-theme="dark"]) .footer,:host([data-theme="dark"]) .mode span,:host([data-theme="dark"]) .channel span,:host([data-theme="dark"]) .muted{color:#aaa!important}
    :host([data-theme="dark"]) .button,:host([data-theme="dark"]) .mode,:host([data-theme="dark"]) .switch,:host([data-theme="dark"]) .input,:host([data-theme="dark"]) .interest{color:#f1f1f1!important;background:#272727!important;border-color:#303030!important}
    :host([data-theme="dark"]) .button:hover,:host([data-theme="dark"]) .mode:hover,:host([data-theme="dark"]) .switch:hover{background:#303030!important;border-color:#555!important}
    :host([data-theme="dark"]) .mode svg{color:#f1f1f1!important}
    :host([data-theme="dark"]) .mode.selected{border-color:#555!important;box-shadow:inset 3px 0 #f1f1f1!important}
    :host([data-theme="dark"]) .button.primary,:host([data-theme="dark"]) .submit,:host([data-theme="dark"]) .switch.primary{background:#f1f1f1!important;color:#0f0f0f!important;border-color:#f1f1f1!important}
    :host([data-theme="dark"]) .button.primary:hover,:host([data-theme="dark"]) .submit:hover,:host([data-theme="dark"]) .switch.primary:hover{background:#ddd!important;color:#0f0f0f!important}
    :host([data-theme="dark"]) .button:focus-visible,:host([data-theme="dark"]) input:focus-visible,:host([data-theme="dark"]) a:focus-visible{outline:2px solid #f1f1f1;outline-offset:2px}
    :host([data-theme="dark"]) .thumbLink,:host([data-theme="dark"]) .thumbnailPlaceholder{background:#272727;color:#aaa}
    :host([data-theme="dark"]) .duration{background:#0f0f0fdd;color:#fff}
    :host([data-theme="dark"]) .badge{background:#272727!important;color:#f1f1f1!important;border:1px solid #303030}
    :host([data-theme="dark"]) .error,:host([data-theme="dark"]) .hint{color:#ff8d82!important}
    :host([data-theme="dark"]) .skeleton{background:linear-gradient(100deg,#181818 25%,#272727 38%,#181818 60%)!important;background-size:200% 100%}
    :host([data-theme="dark"]) .wrap.home-wrap,:host([data-theme="dark"]) .wrap.results-wrap{background:linear-gradient(145deg,rgba(25,25,25,.88),rgba(12,12,12,.92))!important;border:1px solid rgba(255,255,255,.075)!important;box-shadow:0 28px 70px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.055)!important;backdrop-filter:blur(18px) saturate(1.08)}
    :host([data-theme="dark"]) .wrap.home-wrap>.status:not(.error),:host([data-theme="dark"]) .wrap.results-wrap>.status:not(.error){padding:0!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
    :host([data-theme="dark"]) .card.video-card{background:linear-gradient(150deg,rgba(35,35,35,.92),rgba(16,16,16,.96))!important;border-color:rgba(255,255,255,.13)!important;box-shadow:0 9px 24px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.065)!important;backdrop-filter:blur(10px)}
    :host([data-theme="dark"]) .card.video-card.is-hovered,:host([data-theme="dark"]) .card.video-card:focus-within{background:linear-gradient(150deg,rgba(43,43,43,.97),rgba(18,18,18,.98))!important;border-color:rgba(255,255,255,.36)!important;box-shadow:0 22px 42px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.055),inset 0 1px rgba(255,255,255,.12)!important}
    :host([data-theme="dark"]) .video-skeleton{background:linear-gradient(155deg,#191919,#111)!important;border-color:#ffffff14!important;box-shadow:inset 0 1px #ffffff05!important}
    :host([data-theme="dark"]) .empty{background:linear-gradient(145deg,#1b1b1b,#121212)!important;border-color:#ffffff18!important}
    :host([data-theme="light"]) .wrap.home-wrap,:host([data-theme="light"]) .wrap.results-wrap{background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(242,246,250,.98))!important;color:#1c2733!important;border:1px solid rgba(33,54,77,.14)!important;box-shadow:0 24px 60px rgba(31,52,74,.11)!important;backdrop-filter:blur(18px)}
    :host([data-theme="light"]) .title,:host([data-theme="light"]) .sectionTitle,:host([data-theme="light"]) .role,:host([data-theme="light"]) .videoTitle,:host([data-theme="light"]) .mode strong{color:#1c2733!important}
    :host([data-theme="light"]) .eyebrow,:host([data-theme="light"]) .intro,:host([data-theme="light"]) .query,:host([data-theme="light"]) .progressLabel,:host([data-theme="light"]) .meta,:host([data-theme="light"]) .reason,:host([data-theme="light"]) .mode span{color:#596a7d!important}
    :host([data-theme="light"]) .card.video-card,:host([data-theme="light"]) .video-skeleton,:host([data-theme="light"]) .statusNotice,:host([data-theme="light"]) .original,:host([data-theme="light"]) .empty{background:linear-gradient(150deg,#fff,#f2f5f8)!important;color:#263548!important;border-color:rgba(35,56,78,.14)!important;box-shadow:0 10px 28px rgba(29,53,77,.08)!important}
    :host([data-theme="light"]) .button,:host([data-theme="light"]) .input,:host([data-theme="light"]) .learn-timer-input{background:#fff!important;color:#243449!important;border-color:rgba(35,56,78,.2)!important}
    :host([data-theme="light"]) .button.primary{background:#b8ed82!important;color:#182510!important;border-color:#a4d86f!important}
    :host([data-theme="light"]) .statusNoticeTitle,:host([data-theme="light"]) .statusNoticeDetails,:host([data-theme="light"]) .statusNoticeHint{color:#46576a!important}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  const style = document.createElement("style");
  style.textContent = `${css}\n${theme}`;
  shadow.append(style);
  return style;
}
export function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.href) node.href = options.href;
  if (options.target) node.target = options.target;
  if (options.rel) node.rel = options.rel;
  if (options.attributes) for (const [name, value] of Object.entries(options.attributes)) node.setAttribute(name, String(value));
  return node;
}
export function button(text, className = "button", action = null) {
  const node = element("button", { text, className, type: "button" });
  if (action) node.addEventListener("click", action);
  return node;
}
export function safeRemove(host) { try { host?.remove(); } catch { /* Navigation cleanup is best effort. */ } }

export function createVideoSkeleton() {
  const card = element("div", { className: "video-skeleton", attributes: { "aria-hidden": "true" } });
  const thumb = element("div", { className: "skeleton-thumb" });
  const copy = element("div", { className: "skeleton-copy" });
  copy.append(
    element("div", { className: "skeleton-line title-line" }),
    element("div", { className: "skeleton-line title-line short" }),
    element("div", { className: "skeleton-line meta-line" })
  );
  card.append(thumb, copy);
  return card;
}

/**
 * Makes a page surface respond subtly to pointer movement and page scrolling.
 * Uses one requestAnimationFrame loop per surface, pauses while hidden, and
 * leaves interaction disabled for coarse pointers and reduced-motion users.
 */
export function enhanceSurfaceMotion(root) {
  if (!root) return () => {};
  const view = root.ownerDocument?.defaultView || window;
  const doc = root.ownerDocument || document;
  const reducedMotion = Boolean(view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const finePointer = Boolean(view.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches);
  const listeners = [];
  let pointerFrame = 0;
  let scrollFrame = 0;
  let disposed = false;
  let latestPointer = null;
  const hero = root.querySelector?.(".hero, .header") || null;

  root.style.setProperty("--spotlight-size", `${MOTION_TUNING.pageSpotlightSize}px`);
  root.style.setProperty("--spotlight-opacity", String(MOTION_TUNING.pageSpotlightOpacity));

  const pauseIfHidden = () => {
    if (doc.visibilityState === "hidden") {
      root.setAttribute("data-motion-paused", "true");
      if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
      if (scrollFrame) view.cancelAnimationFrame(scrollFrame);
      pointerFrame = 0;
      scrollFrame = 0;
    } else {
      root.removeAttribute("data-motion-paused");
      if (!reducedMotion) scheduleScroll();
    }
  };

  const applyPointer = () => {
    pointerFrame = 0;
    if (disposed || doc.visibilityState === "hidden" || !latestPointer) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (latestPointer.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (latestPointer.clientY - rect.top) / rect.height));
    root.style.setProperty("--pointer-x", `${(x * 100).toFixed(2)}%`);
    root.style.setProperty("--pointer-y", `${(y * 100).toFixed(2)}%`);
    if (hero) {
      const dx = (x - 0.5) * MOTION_TUNING.heroParallaxPixels * 2;
      const dy = (y - 0.5) * MOTION_TUNING.heroParallaxPixels * 2;
      hero.style.setProperty("--hero-shift-x", `${dx.toFixed(2)}px`);
      hero.style.setProperty("--hero-shift-y", `${dy.toFixed(2)}px`);
    }
    // A magnetic nudge on the primary refresh action; never alter its click area
    // beyond a few pixels, and reset it when the pointer leaves the button.
    for (const target of root.querySelectorAll?.(".magneticButton") || []) {
      const b = target.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const distance = Math.hypot(latestPointer.clientX - cx, latestPointer.clientY - cy);
      if (distance < Math.max(b.width, b.height) * 1.35) {
        const strength = MOTION_TUNING.magneticButtonStrength;
        target.style.setProperty("--magnet-x", `${((latestPointer.clientX - cx) * strength).toFixed(2)}px`);
        target.style.setProperty("--magnet-y", `${((latestPointer.clientY - cy) * strength).toFixed(2)}px`);
        target.classList.add("is-magnetic");
      } else {
        target.style.setProperty("--magnet-x", "0px");
        target.style.setProperty("--magnet-y", "0px");
        target.classList.remove("is-magnetic");
      }
    }
  };

  const onPointerMove = event => {
    if (reducedMotion || !finePointer || event.pointerType === "touch" || disposed) return;
    latestPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!pointerFrame && doc.visibilityState !== "hidden") pointerFrame = view.requestAnimationFrame(applyPointer);
  };
  const onPointerLeave = () => {
    latestPointer = null;
    if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    root.style.setProperty("--pointer-x", "50%");
    root.style.setProperty("--pointer-y", "12%");
    if (hero) {
      hero.style.setProperty("--hero-shift-x", "0px");
      hero.style.setProperty("--hero-shift-y", "0px");
    }
    for (const target of root.querySelectorAll?.(".magneticButton") || []) {
      target.style.setProperty("--magnet-x", "0px");
      target.style.setProperty("--magnet-y", "0px");
      target.classList.remove("is-magnetic");
    }
  };
  const scheduleScroll = () => {
    if (reducedMotion || scrollFrame || disposed || doc.visibilityState === "hidden") return;
    scrollFrame = view.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (disposed || doc.visibilityState === "hidden") return;
      const rect = root.getBoundingClientRect();
      const vh = view.innerHeight || doc.documentElement.clientHeight || 1;
      const offset = ((rect.top + rect.height / 2) - vh / 2) / (vh / 2 || 1);
      const drift = Math.max(-8, Math.min(8, offset * -4));
      root.style.setProperty("--scroll-drift", `${drift.toFixed(2)}px`);
    });
  };

  if (finePointer && !reducedMotion) {
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave, { passive: true });
    listeners.push(() => root.removeEventListener("pointermove", onPointerMove));
    listeners.push(() => root.removeEventListener("pointerleave", onPointerLeave));
  }
  if (!reducedMotion) {
    view.addEventListener("scroll", scheduleScroll, { passive: true });
    view.addEventListener("resize", scheduleScroll, { passive: true });
    doc.addEventListener("visibilitychange", pauseIfHidden);
    listeners.push(() => view.removeEventListener("scroll", scheduleScroll));
    listeners.push(() => view.removeEventListener("resize", scheduleScroll));
    listeners.push(() => doc.removeEventListener("visibilitychange", pauseIfHidden));
    scheduleScroll();
  }

  // Ripple feedback is event-driven and purely decorative; the button action
  // remains attached by the caller and is never intercepted.
  const onClick = event => {
    const target = event.target?.closest?.(".magneticButton");
    if (!target || !root.contains(target) || reducedMotion) return;
    const rect = target.getBoundingClientRect();
    const ripple = element("span", { className: "buttonRipple", attributes: { "aria-hidden": "true" } });
    const rippleX = event.detail === 0 ? rect.width / 2 : event.clientX - rect.left;
    const rippleY = event.detail === 0 ? rect.height / 2 : event.clientY - rect.top;
    ripple.style.left = `${rippleX}px`;
    ripple.style.top = `${rippleY}px`;
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  };
  root.addEventListener("click", onClick);
  listeners.push(() => root.removeEventListener("click", onClick));

  return () => {
    disposed = true;
    if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
    if (scrollFrame) view.cancelAnimationFrame(scrollFrame);
    listeners.forEach(cleanup => cleanup());
    root.removeAttribute("data-motion-paused");
    root.style.removeProperty("--pointer-x");
    root.style.removeProperty("--pointer-y");
    root.style.removeProperty("--scroll-drift");
    root.style.removeProperty("--spotlight-size");
    root.style.removeProperty("--spotlight-opacity");
    if (hero) {
      hero.style.removeProperty("--hero-shift-x");
      hero.style.removeProperty("--hero-shift-y");
    }
  };
}

/** Adds restrained pointer tilt and thumbnail parallax to one video grid. */
export function enhanceVideoGridMotion(grid) {
  const cards = Array.from(grid?.querySelectorAll?.(".video-card") || []);
  if (!cards.length) return () => {};
  const view = grid.ownerDocument?.defaultView || window;
  const doc = grid.ownerDocument || document;
  const reducedMotion = Boolean(view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const finePointer = Boolean(view.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches);
  const listeners = [];
  let scrollFrame = 0;
  let disposed = false;

  cards.forEach((card, index) => {
    card.style.setProperty("--card-delay", `${Math.min(index, 10) * 42}ms`);
    card.style.setProperty("--scroll-parallax", "0px");
    if (reducedMotion || !finePointer) return;
    let latest = null;
    let pointerFrame = 0;
    const onPointerMove = event => {
      if (event.pointerType === "touch") return;
      latest = { x: event.clientX, y: event.clientY };
      if (pointerFrame || doc.visibilityState === "hidden") return;
      pointerFrame = view.requestAnimationFrame(() => {
        pointerFrame = 0;
        if (disposed || doc.visibilityState === "hidden" || !latest) return;
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.max(0, Math.min(1, (latest.x - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (latest.y - rect.top) / rect.height));
        const tilt = MOTION_TUNING.cardTiltDegrees;
        card.style.setProperty("--card-lift", `${-MOTION_TUNING.cardLiftPixels}px`);
        card.style.setProperty("--tilt-x", `${((0.5 - y) * tilt * 2).toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${((x - 0.5) * tilt * 2).toFixed(2)}deg`);
        card.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
        card.classList.add("is-hovered");
      });
    };
    const resetPointer = () => {
      latest = null;
      if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      card.style.removeProperty("--card-lift");
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      card.style.setProperty("--glare-x", "50%");
      card.style.setProperty("--glare-y", "50%");
      card.classList.remove("is-hovered");
    };
    card.addEventListener("pointermove", onPointerMove, { passive: true });
    card.addEventListener("pointerleave", resetPointer, { passive: true });
    listeners.push(() => {
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerleave", resetPointer);
      if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
      resetPointer();
    });
  });

  const updateParallax = () => {
    scrollFrame = 0;
    if (disposed || doc.visibilityState === "hidden") return;
    const viewportHeight = view.innerHeight || doc.documentElement.clientHeight || 1;
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) return;
      const centerOffset = ((rect.top + rect.height / 2) - viewportHeight / 2) / (viewportHeight / 2 || 1);
      const shift = reducedMotion ? 0 : Math.max(-MOTION_TUNING.thumbnailParallaxPixels, Math.min(MOTION_TUNING.thumbnailParallaxPixels, centerOffset * -3.2));
      card.style.setProperty("--scroll-parallax", `${shift.toFixed(2)}px`);
    });
  };
  const scheduleParallax = () => {
    if (scrollFrame || disposed || doc.visibilityState === "hidden") return;
    scrollFrame = view.requestAnimationFrame(updateParallax);
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") {
      if (scrollFrame) view.cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    } else scheduleParallax();
  };
  view.addEventListener("scroll", scheduleParallax, { passive: true });
  view.addEventListener("resize", scheduleParallax, { passive: true });
  doc.addEventListener("visibilitychange", onVisibility);
  listeners.push(() => view.removeEventListener("scroll", scheduleParallax));
  listeners.push(() => view.removeEventListener("resize", scheduleParallax));
  listeners.push(() => doc.removeEventListener("visibilitychange", onVisibility));
  scheduleParallax();

  return () => {
    disposed = true;
    listeners.forEach(cleanup => cleanup());
    if (scrollFrame) view.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    cards.forEach(card => card.style.removeProperty("--scroll-parallax"));
  };
}

/** Compact accessible disclosure for long provider/ranking notices. */
export function createStatusNotice(message, options = {}) {
  const fullMessage = String(message ?? "").trim();
  const low = fullMessage.toLowerCase();
  const defaultTitle = /ollama|rank|scor/.test(low) ? "AI ranking unavailable" : "Feed notice";
  const title = options.title || defaultTitle;
  const hint = options.hint || (/unranked|fallback|search matches/.test(low)
    ? "Showing available videos without AI ranking"
    : "View details");
  const notice = element("details", { className: `statusNotice${options.kind === "error" ? " statusNotice-error" : ""}` });
  const summary = element("summary", { className: "statusNoticeSummary" });
  summary.append(
    element("span", { className: "statusNoticeIcon", text: options.kind === "error" ? "!" : "i", attributes: { "aria-hidden": "true" } }),
    element("span", { className: "statusNoticeCopy" })
  );
  const copy = summary.querySelector(".statusNoticeCopy");
  copy.append(
    element("span", { className: "statusNoticeTitle", text: title }),
    element("span", { className: "statusNoticeHint", text: hint })
  );
  summary.append(element("span", { className: "statusNoticeChevron", text: "⌄", attributes: { "aria-hidden": "true" } }));
  const body = element("div", { className: "statusNoticeDetails" });
  body.append(element("p", { text: fullMessage }));
  notice.append(summary, body);
  return notice;
}

export function setHostFixed(host, className = "") {
  host.className = className;
}
export function formatViews(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  try { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value)) + " views"; }
  catch { return `${Number(value).toLocaleString()} views`; }
}
export function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${minutes}:${String(secs).padStart(2,"0")}`;
}
export function componentCss() {
  return `:host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d2925;line-height:1.45;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.button{border:1px solid #d2dcd7;background:#fff;color:#26332e;border-radius:12px;padding:10px 14px;font-weight:650;transition:background .16s,border-color .16s}.button:hover{background:#eef5f1;border-color:#9db7aa}.button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}.button.primary{background:#174c3a;color:#fff;border-color:#174c3a}.button.primary:hover{background:#226249}.muted{color:#64716c}.eyebrow{text-transform:uppercase;letter-spacing:.11em;font-size:11px;font-weight:750;color:#547267}.panel{background:#fbfcfa;border:1px solid #e0e8e2;border-radius:18px;box-shadow:0 10px 35px #1c382516}.status{padding:16px;border:1px solid #e4e9e5;background:#fff;border-radius:14px}.error{border-color:#e9c9c1;background:#fff8f6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:16px}.skeleton{height:248px;border-radius:16px;background:linear-gradient(100deg,#edf1ed 25%,#f8faf8 38%,#edf1ed 60%);background-size:200% 100%;animation:ft-shimmer 1.2s ease-in-out infinite}@keyframes ft-shimmer{to{background-position-x:-200%}}`;
}
