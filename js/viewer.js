/*
  Digital edition viewer.

  Reads window.EDITION (built from the TEI by xslt/tei-to-site.xsl) and
  window.FONTS (fonts/fonts.js) and shows the pages in two panes.

  The view lives in the URL, e.g.  index.html#p=1v&layout=lat-eng&reading=dipl&font=humanist
  so any view can be bookmarked or emailed.
*/
(function () {
  "use strict";

  const ED = window.EDITION;
  const FONTS = window.FONTS || [];
  const FALLBACK = window.FALLBACK_FONT || "Junicode";
  const STORE_KEY = "edition-viewer-prefs";

  if (!ED || !Array.isArray(ED.pages) || ED.pages.length === 0) {
    document.getElementById("panes").innerHTML =
      '<p class="notice">No pages found. Build <code>data/edition.js</code> from the TEI first (see README.md).</p>';
    return;
  }
  const PAGES = ED.pages;

  /* ---------------- Pane types ----------------
     Each pane shows one kind of content for a page. A future "facsimile" pane
     (an IIIF viewer) would be added here as another entry. */
  const PANE_TYPES = {
    latin: {
      label: "Latin",
      lang: "la",
      html: (page) => page.latin,
      missing: "No transcription for this page yet."
    },
    english: {
      label: "English",
      lang: "en",
      html: (page) => page.english,
      missing: "Translation in progress."
    }
  };

  /* ---------------- Layouts ----------------
     panes: [pane type, page offset]. step: pages moved by prev/next. */
  const LAYOUTS = {
    "lat-eng": { label: "Latin | English", panes: [["latin", 0], ["english", 0]], step: 1 },
    "lat-lat": { label: "Latin | Latin", panes: [["latin", 0], ["latin", 1]], step: 2 },
    "eng-eng": { label: "English | English", panes: [["english", 0], ["english", 1]], step: 2 }
  };

  /* Page-turn animation: speed multiplier per setting (0 = no animation) */
  const TURN_MODES = { normal: { label: "Normal", speed: 1 }, fast: { label: "2×", speed: 2 }, off: { label: "Off", speed: 0 } };

  const DEFAULTS = { p: PAGES[0].n, layout: "lat-eng", reading: "norm", font: (FONTS[1] || FONTS[0] || {}).id, turn: "normal" };

  /* ---------------- State ---------------- */
  const state = Object.assign({}, DEFAULTS, loadPrefs(), readHash());
  normalizeState();

  function normalizeState() {
    if (!LAYOUTS[state.layout]) state.layout = DEFAULTS.layout;
    if (state.reading !== "dipl" && state.reading !== "norm") state.reading = DEFAULTS.reading;
    if (!FONTS.some((f) => f.id === state.font)) state.font = DEFAULTS.font;
    if (pageIndex(state.p) < 0) state.p = DEFAULTS.p;
    if (!TURN_MODES[state.turn]) state.turn = DEFAULTS.turn;
  }

  function pageIndex(n) {
    return PAGES.findIndex((pg) => pg.n === n);
  }

  function readHash() {
    const out = {};
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    for (const key of ["p", "layout", "reading", "font"]) {
      if (params.has(key)) out[key] = params.get(key);
    }
    return out;
  }

  function writeHash() {
    const params = new URLSearchParams({ p: state.p, layout: state.layout, reading: state.reading, font: state.font });
    const hash = "#" + params.toString();
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* private window or blocked storage: the URL still holds the view */
    }
  }

  /* ---------------- Fonts ---------------- */
  function installFonts() {
    const rules = [];
    for (const font of FONTS) {
      const files = font.files || [{ file: font.file }];
      for (const f of files) {
        if (!f.file) continue;
        const ext = f.file.split(".").pop().toLowerCase();
        const format = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[ext] || ext;
        rules.push(
          "@font-face{" +
            'font-family:"' + font.family + '";' +
            'src:url("fonts/' + encodeURI(f.file) + '") format("' + format + '");' +
            "font-weight:" + (f.weight || "400") + ";" +
            "font-style:" + (f.style || "normal") + ";" +
            "font-display:swap}"
        );
      }
    }
    const style = document.createElement("style");
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  function applyFont() {
    const font = FONTS.find((f) => f.id === state.font);
    if (!font) return;
    const root = document.documentElement.style;
    root.setProperty("--text-font", '"' + font.family + '", "' + FALLBACK + '", Georgia, serif');
    root.setProperty("--text-style", font.style || "normal");
  }

  /* ---------------- Rendering ---------------- */
  const panesEl = document.getElementById("panes");

  function render() {
    normalizeState();
    document.body.dataset.reading = state.reading;
    applyFont();

    const layout = LAYOUTS[state.layout];
    const i = pageIndex(state.p);
    panesEl.innerHTML = "";

    layout.panes.forEach(([type, offset], k) => {
      const pane = renderPane(PANE_TYPES[type], type, PAGES[i + offset]);
      pane.dataset.side = k === 0 ? "verso" : "recto";   /* left page / right page of the spread */
      panesEl.appendChild(pane);
    });

    updateControls(i, layout);
    writeHash();
    savePrefs();
  }

  function renderPane(paneType, typeId, page) {
    const pane = document.createElement("section");
    pane.className = "pane";
    pane.dataset.type = typeId;

    const head = document.createElement("div");
    head.className = "pane-head";
    const body = document.createElement("div");
    body.className = "pane-body";
    /* Not lang="la": some fonts (EB Garamond) then silently swap u→v for
       Latin, which would falsify the transcription. */
    body.dataset.lang = paneType.lang;

    /* Running head: the title, as at the top of a printed page */
    const running = document.createElement("span");
    running.className = "running-title";
    running.textContent = ED.title || "";
    head.appendChild(running);

    if (!page) {
      pane.setAttribute("aria-label", paneType.label);
      body.innerHTML = '<p class="pane-empty">End of the manuscript.</p>';
      pane.append(head, body);
      return pane;
    } else {
      pane.setAttribute("aria-label", paneType.label + ", fol. " + page.n);
      if (page.facs) {
        const a = document.createElement("a");
        a.href = page.facs;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "View original ↗";
        a.title = "Open this page in the library's viewer (new tab)";
        head.appendChild(a);
      }
      const html = paneType.html(page);
      body.innerHTML = html && html.trim() ? html : '<p class="pane-empty">' + paneType.missing + "</p>";
    }
    pane.append(head, body);

    /* Footnotes: move each note's text from the line to the foot of the page */
    const notes = body.querySelectorAll(".note-body");
    if (notes.length) {
      const foot = document.createElement("div");
      foot.className = "footnotes";
      notes.forEach((note) => {
        note.hidden = false;
        foot.appendChild(note);
      });
      body.querySelectorAll(".note-ref").forEach((ref) => {
        ref.removeAttribute("aria-expanded");
        ref.title = "Highlight footnote";
      });
      pane.appendChild(foot);
    }

    /* Folio number in the outer bottom corner */
    const folio = document.createElement("div");
    folio.className = "folio-foot";
    folio.textContent = page.n;
    pane.appendChild(folio);
    return pane;
  }

  /* ---------------- Controls ---------------- */
  const layoutCtl = document.getElementById("layout-ctl");
  const readingCtl = document.getElementById("reading-ctl");
  const fontCtl = document.getElementById("font-ctl");
  const pageCtl = document.getElementById("page-ctl");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const turnCtl = document.getElementById("turn-ctl");

  function buildControls() {
    document.getElementById("ed-title").textContent = ED.title || "Digital Edition";
    document.title = ED.title || "Digital Edition";

    for (const [id, layout] of Object.entries(LAYOUTS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = id;
      b.textContent = layout.label;
      layoutCtl.appendChild(b);
    }
    for (const font of FONTS) {
      fontCtl.add(new Option(font.label, font.id));
    }
    for (const page of PAGES) {
      pageCtl.add(new Option("fol. " + page.n, page.n));
    }

    layoutCtl.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { state.layout = b.dataset.value; render(); }
    });
    readingCtl.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { state.reading = b.dataset.value; render(); }
    });
    fontCtl.addEventListener("change", () => { state.font = fontCtl.value; render(); });
    pageCtl.addEventListener("change", () => goTo(pageCtl.value));
    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    turnCtl.addEventListener("click", () => {      /* cycles Normal → 2× → Off */
      const modes = Object.keys(TURN_MODES);
      state.turn = modes[(modes.indexOf(state.turn) + 1) % modes.length];
      updateControls(pageIndex(state.p), LAYOUTS[state.layout]);
      savePrefs();
    });

    document.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest("input, select, textarea") || document.getElementById("lightbox").open) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });

    window.addEventListener("hashchange", () => {
      Object.assign(state, readHash());
      render();
    });
  }

  function step(dir) {
    const layout = LAYOUTS[state.layout];
    const i = pageIndex(state.p);
    const target = Math.min(Math.max(i + dir * layout.step, 0), PAGES.length - 1);
    if (target !== i) goTo(PAGES[target].n);
  }

  /* Go to a page, turning the leaf forwards or backwards like a book. */
  function goTo(n) {
    const dir = Math.sign(pageIndex(n) - pageIndex(state.p));
    turnPage(dir, () => {
      state.p = n;
      render();
      window.scrollTo({ top: 0 });
    });
  }

  /* ---------------- Page-turn animation ----------------
     Forwards: the right page lifts at the spine and turns over to the left;
     its back is the new left page. Backwards: the mirror image. Underneath,
     the new spread is already in place; a still copy of the page that hasn't
     turned yet covers its new counterpart until the leaf lands on it.
     Skipped on narrow screens (pages stacked) and when the reader's system
     asks for reduced motion. */
  const FLIP_MS = 1200;
  const STRIPS = 22;        /* the turning page is cut into this many hinged strips so it can bend */
  const BEND = 45;          /* how far (degrees) the outer edge leads or trails the spine edge */
  const FRAMES = 48;        /* keyframes sampled along the turn */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let flipping = null;

  function docRect(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
  }

  function placed(el, rect, height) {
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.width = rect.width + "px";
    el.style.height = (height || rect.height) + "px";
    return el;
  }

  /* Every diagram in the edition, loaded and decoded once at startup, so a
     page turn always has a ready picture to paint from, even for a page not
     yet shown. Keyed by full URL. */
  const PRELOADED = new Map();
  function preloadPictures() {
    const scratch = document.createElement("div");
    for (const page of PAGES) {
      scratch.innerHTML = (page.latin || "") + (page.english || "");
      scratch.querySelectorAll("img").forEach((img) => {
        if (PRELOADED.has(img.src)) return;
        const pic = new Image();
        pic.src = img.src;
        if (pic.decode) pic.decode().catch(() => {});
        PRELOADED.set(img.src, pic);
      });
    }
    scratch.innerHTML = "";
  }

  /* The diagrams on a page, with the size they are drawn at */
  function pictures(pane) {
    return Array.from(pane.querySelectorAll("img"), (img) => {
      const r = img.getBoundingClientRect();
      return { img, width: r.width, height: r.height };
    });
  }

  /* In a copy of a page, replace each diagram with a canvas painted from the
     diagram already on screen. A copied <img> has to be loaded and decoded
     again (especially when the edition is opened as a file), and shows up
     blank for a few frames; a painted canvas is there at once. */
  function paintPictures(copy, pics) {
    copy.querySelectorAll("img").forEach((img, k) => {
      const pic = pics[k];
      if (!pic || !pic.width) return;
      if (!pic.painted) {                /* paint once, then copy that bitmap into every strip */
        const ready = (im) => im && im.complete && im.naturalWidth;
        const source = ready(pic.img) ? pic.img : PRELOADED.get(pic.img.src);
        if (!ready(source)) return;
        const height = pic.height || pic.width * source.naturalHeight / source.naturalWidth;
        const ratio = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(pic.width * ratio);
        canvas.height = Math.round(height * ratio);
        try {
          canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          return;                        /* leave the image as it is */
        }
        pic.painted = { canvas, width: pic.width, height };
      }
      const { canvas: art, width, height } = pic.painted;
      const canvas = document.createElement("canvas");
      canvas.width = art.width;
      canvas.height = art.height;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.getContext("2d").drawImage(art, 0, 0);
      img.replaceWith(canvas);
    });
  }

  /* A still copy of a page, fixed at its size on screen, diagrams painted in */
  function copyOf(page) {
    const copy = page.pane.cloneNode(true);
    copy.style.width = page.rect.width + "px";
    copy.style.height = page.rect.height + "px";
    copy.style.minHeight = "0";
    paintPictures(copy, page.pics);
    return copy;
  }

  /* One side of a strip: a window onto a copy of the page, offset to show the
     slice at x. It overlaps its neighbours by 1px each side to hide seams. */
  function stripFace(page, x, width, height, back) {
    const f = document.createElement("div");
    f.className = "flip-face" + (back ? " back" : "");
    f.style.width = width + 2 + "px";
    f.style.height = height + "px";
    f.style.left = "-1px";
    const copy = copyOf(page);
    copy.style.position = "absolute";
    copy.style.top = "0";
    copy.style.left = -(x - 1) + "px";
    const shade = document.createElement("div");
    shade.className = "flip-shade";
    f.append(copy, shade);
    return f;
  }

  function turnPage(dir, apply) {
    if (flipping) flipping();          /* a turn already under way: land it now */
    const old = panesEl.querySelectorAll(".pane");
    const twoUp = old.length === 2 &&
      Math.abs(old[0].getBoundingClientRect().top - old[1].getBoundingClientRect().top) < 2;
    const speed = TURN_MODES[state.turn].speed;
    if (!dir || !twoUp || !speed || reduceMotion.matches) { apply(); return; }

    const oldL = { pane: old[0].cloneNode(true), rect: docRect(old[0]), pics: pictures(old[0]) };
    const oldR = { pane: old[1].cloneNode(true), rect: docRect(old[1]), pics: pictures(old[1]) };
    apply();
    const now = panesEl.querySelectorAll(".pane");
    if (now.length !== 2) return;
    const newL = { pane: now[0], rect: docRect(now[0]), pics: pictures(now[0]) };
    const newR = { pane: now[1], rect: docRect(now[1]), pics: pictures(now[1]) };

    const fwd = dir > 0;
    const sgn = fwd ? -1 : 1;          /* rotation direction about the spine */
    /* forwards: old left page stays put until covered; leaf = old right → new left */
    const still = fwd ? oldL : oldR;
    const stillAt = fwd ? newL.rect : newR.rect;
    const front = fwd ? oldR : oldL;
    const back = fwd ? newL : newR;

    const layer = document.createElement("div");
    layer.className = "flip-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;

    /* the page that doesn't turn, shown as it was until the leaf lands on it */
    const cover = placed(document.createElement("div"), { ...stillAt, height: still.rect.height });
    cover.className = "flip-cover";
    cover.appendChild(copyOf(still));

    /* The leaf: a chain of strips hinged together, starting at the spine.
       Each strip is a child of the one before, so small angles add up to a curve. */
    const W = front.rect.width;
    const H = Math.max(front.rect.height, back.rect.height);
    const leaf = placed(document.createElement("div"), front.rect, H);
    leaf.className = "flip-leaf";
    leaf.style.perspectiveOrigin = fwd ? "0% 50%" : "100% 50%";   /* eye level with the spine */

    const step = Math.ceil(W / STRIPS);
    const strips = [];
    let parent = leaf;
    for (let dist = 0; dist < W - 0.5; dist += step) {   /* dist: this strip's distance from the spine */
      const w = Math.min(step, W - dist);
      const strip = document.createElement("div");
      strip.className = "flip-strip";
      strip.style.width = w + "px";
      strip.style.height = H + "px";
      strip.style.transformOrigin = fwd ? "left center" : "right center";
      strip.style[fwd ? "left" : "right"] = strips.length ? "100%" : "0";
      /* slice positions: on the front, measured from the spine side; the back is mirrored */
      const frontX = fwd ? dist : W - dist - w;
      const backX = fwd ? W - dist - w : dist;
      strip.append(stripFace(front, frontX, w, H, false), stripFace(back, backX, w, H, true));
      parent.appendChild(strip);
      strips.push(strip);
      parent = strip;
    }

    layer.append(cover, leaf);
    document.body.appendChild(layer);

    /* The motion: the spine angle eases from 0 to 180°. On top of that the page
       bends: early on the outer edge leads (the page is lifted by its edge),
       through the middle it stays curled, and at the end the edge trails and
       settles last. Light falls off as each strip tilts. Each strip shows its
       front until it passes upright, then its back; the code switches this
       itself rather than leaving it to the browser's backface-visibility. */
    const per = BEND / strips.length;
    const turn = (t) => 180 * (0.5 - 0.5 * Math.cos(Math.PI * t));
    const bend = (t) => per * (0.6 * Math.sin(Math.PI * t) + 0.75 * Math.sin(2 * Math.PI * t));
    const frames = Array.from({ length: FRAMES + 1 }, (_, k) => k / FRAMES);
    const opts = { duration: FLIP_MS / speed, easing: "linear", fill: "forwards" };
    const anims = [];
    strips.forEach((strip, i) => {
      anims.push(strip.animate(frames.map((t) => ({
        transform: "rotateY(" + sgn * ((i === 0 ? turn(t) : 0) + bend(t)) + "deg)"
      })), opts));
      /* this strip's angle to the reader: spine angle plus the bends of every strip up to it */
      const angles = frames.map((t) => turn(t) + (i + 1) * bend(t));
      const shade = angles.map((a) => ({ opacity: (0.22 * Math.abs(Math.sin(a * Math.PI / 180))).toFixed(3) }));
      /* (steps: switch exactly at a keyframe, so both sides are never shown together) */
      const snap = (show) => angles.map((a) => ({ visibility: show(a) ? "visible" : "hidden", easing: "steps(1, end)" }));
      const [frontF, backF] = strip.querySelectorAll(":scope > .flip-face");
      anims.push(frontF.animate(snap((a) => a < 90), opts), backF.animate(snap((a) => a >= 90), opts));
      anims.push(frontF.lastChild.animate(shade, opts), backF.lastChild.animate(shade, opts));
    });

    const done = () => {
      if (flipping !== done) return;
      flipping = null;
      anims.forEach((a) => a.cancel());
      layer.remove();
    };
    flipping = done;
    anims[0].finished.then(done, done);
  }

  function updateControls(i, layout) {
    for (const b of layoutCtl.children) b.setAttribute("aria-pressed", String(b.dataset.value === state.layout));
    for (const b of readingCtl.children) b.setAttribute("aria-pressed", String(b.dataset.value === state.reading));
    fontCtl.value = state.font;
    pageCtl.value = state.p;
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i + layout.step > PAGES.length - 1;
    const showsLatin = layout.panes.some(([t]) => t === "latin");
    readingCtl.closest("fieldset").disabled = !showsLatin;
    turnCtl.textContent = TURN_MODES[state.turn].label;
  }

  /* ---------------- Notes & diagrams ---------------- */
  const lightbox = document.getElementById("lightbox");

  panesEl.addEventListener("click", (e) => {
    const ref = e.target.closest(".note-ref");
    if (ref) {
      /* The nth note number in a page belongs to the nth footnote */
      const pane = ref.closest(".pane");
      const k = Array.from(pane.querySelectorAll(".note-ref")).indexOf(ref);
      const note = pane.querySelectorAll(".footnotes .note-body")[k];
      if (note) {
        pane.querySelectorAll(".note-body.lit").forEach((n) => n.classList.remove("lit"));
        note.classList.add("lit");
        note.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }
    const zoom = e.target.closest(".fig-zoom");
    if (zoom) {
      const img = zoom.querySelector("img");
      lightbox.querySelector("img").src = img.src;
      lightbox.querySelector("img").alt = img.alt;
      lightbox.querySelector(".lightbox-caption").textContent = img.alt;
      lightbox.showModal();
    }
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.closest(".lightbox-close")) lightbox.close();
  });

  /* ---------------- Go ---------------- */
  installFonts();
  buildControls();
  render();
  preloadPictures();
})();
