/**
 * The only script a prerendered velvet.li page publishes.
 *
 * Written as plain JavaScript and inlined into every prerendered document by
 * `prerenderStaticEntry`, rather than imported: those pages ship no bundle, so
 * nothing a component renders can be wired by the component itself.
 *
 * Each part looks for what it needs and returns when the page does not have
 * it, so one script serves every page without any of them carrying code for
 * the others.
 */
(function () {
  /**
   * Copy buttons.
   *
   * They ship disabled and are enabled here, which means a reader whose
   * browser cannot copy, or who receives the document without this running, is
   * shown no control rather than a dead one.
   */
  if (navigator.clipboard) {
    for (const button of document.querySelectorAll("[data-copy-code]")) {
      const code = button.parentElement.querySelector("pre > code");
      if (!code) continue;
      button.disabled = false;
      button.addEventListener("click", async function () {
        // The numbers live in a column of their own, outside this element, so
        // a line's text is the line. Only text and elements are read all the
        // same: the renderer leaves anchor comments between the parts, and
        // their textContent is "[" and "]", which put a bracket around every
        // copied line until this filter named the node types it wanted rather
        // than the one it did not.
        const lines = [...code.querySelectorAll(".line")].map(function (line) {
          return [...line.childNodes]
            .filter(function (node) {
              return (
                node.nodeType === Node.TEXT_NODE ||
                node.nodeType === Node.ELEMENT_NODE
              );
            })
            .map(function (node) {
              return node.textContent;
            })
            .join("");
        });
        try {
          await navigator.clipboard.writeText(lines.join("\n"));
          button.setAttribute("data-copied", "");
          setTimeout(function () {
            button.removeAttribute("data-copied");
          }, 3000);
        } catch {
          // A refused clipboard leaves the button as it was. Nothing is
          // claimed to have been copied that was not.
        }
      });
    }
  }

  /**
   * One scroll, whichever browser is reading.
   *
   * `scroll-behavior: smooth` says that a scroll should be animated and nothing
   * about how. Duration and easing are the browser's, and the browsers differ:
   * Chrome eases in and out over a comfortable distance whilst Safari covers it
   * almost at once and in a straight line. CSS exposes neither figure, so the
   * only way to have the two agree is to move the page here.
   *
   * Everything this does not intercept still follows the stylesheet. A reader
   * whose script never runs follows an ordinary link to an ordinary anchor.
   */
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  /** Cancels the animation in flight, or nothing when none is running. */
  let stopScrolling = null;

  /**
   * Moves the page to a position over time, easing in and out.
   *
   * @param {number} to - Where the page should come to rest.
   */
  function glideTo(to) {
    const from = scrollY;
    const distance = to - from;
    if (distance === 0) return;
    // Long enough to be read as movement and short enough not to be waited
    // for, and proportional in between, so a neighbouring topic does not take
    // as long to reach as one at the far end of the document.
    const duration = Math.min(900, Math.max(320, Math.abs(distance) * 0.45));
    const started = performance.now();
    let frame = 0;

    function abandon() {
      // A reader who reaches for the page owns it from that moment. Without
      // this the animation would keep pulling against them until it finished.
      cancelAnimationFrame(frame);
      removeEventListener("wheel", abandon);
      removeEventListener("touchstart", abandon);
      removeEventListener("keydown", abandon);
      stopScrolling = null;
    }
    stopScrolling = abandon;
    addEventListener("wheel", abandon, { passive: true, once: true });
    addEventListener("touchstart", abandon, { passive: true, once: true });
    addEventListener("keydown", abandon, { once: true });

    function step(now) {
      const elapsed = Math.min(1, (now - started) / duration);
      // Ease in and out: slow at both ends, quickest in the middle. This is
      // the shape Chrome draws and the one Safari does not.
      const eased =
        elapsed < 0.5
          ? 4 * elapsed * elapsed * elapsed
          : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      // Instant on every frame, because the stylesheet asks for a smooth
      // scroll and the two animations would otherwise fight over the same
      // position, each starting a new one from where the other had got to.
      scrollTo({ top: from + distance * eased, behavior: "instant" });
      if (elapsed < 1) frame = requestAnimationFrame(step);
      else abandon();
    }
    frame = requestAnimationFrame(step);
  }

  addEventListener("click", function (event) {
    // Anything but a plain click belongs to the browser: a modified click opens
    // a tab, and a middle click opens one too.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href^='#']");
    if (!link) return;
    const id = decodeURIComponent(link.getAttribute("href").slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    // Under reduced motion the browser's own jump is what was asked for, so
    // this steps aside entirely rather than animating more gently.
    if (reducedMotion.matches) return;

    event.preventDefault();
    if (stopScrolling) stopScrolling();
    // The same position the anchor would have reached, which is the element's
    // own `scroll-margin-top` clear of the sticky bar. Read from the element so
    // that a page stating a different margin is followed rather than second
    // guessed.
    const margin =
      Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const top = target.getBoundingClientRect().top + scrollY - margin;
    const furthest = document.documentElement.scrollHeight - innerHeight;
    glideTo(Math.max(0, Math.min(top, furthest)));
    // The address bar keeps up, so the topic can be shared and the back button
    // returns to the one before it. Written rather than assigned, because
    // assigning to `location.hash` scrolls the page a second time.
    history.pushState(null, "", `#${id}`);
  });

  /**
   * The topic being read, marked in a sidebar that has one.
   *
   * Without this the sidebar still works: every entry is an ordinary link to
   * an ordinary anchor, so a reader whose script never runs can still reach
   * any topic; only the mark showing where they are is missing.
   */
  const headings = [...document.querySelectorAll("[data-topic]")];
  const links = new Map(
    [...document.querySelectorAll("[data-topic-link]")].map(function (link) {
      return [link.dataset.topicLink, link];
    }),
  );
  if (headings.length === 0 || links.size === 0) return;

  let marked = null;
  function mark() {
    // The last heading that has passed the line the sticky bar leaves free,
    // which is the one whose content fills the screen. Before the first has
    // passed it, the first is the one being read.
    const line = 120;
    let current = headings[0];
    // At the end of the scroll there is nothing further to reach, so the final
    // heading is the one being read however far down the window it sits.
    // Without this a last section shorter than a screenful can never be
    // marked: the page stops scrolling whilst its heading is still below the
    // line, so following its link left the mark on the section before it.
    // Measured on the reference at a 900px window: at the foot of the page,
    // scrolled to 14517 of a possible 14517, the last heading sat at 566.
    const atEnd =
      Math.ceil(scrollY + innerHeight) >=
      document.documentElement.scrollHeight;
    if (atEnd) {
      current = headings[headings.length - 1];
    } else {
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= line) current = heading;
        else break;
      }
    }
    const link = links.get(current.dataset.topic);
    if (!link || link === marked) return;
    if (marked) marked.removeAttribute("data-current");
    link.setAttribute("data-current", "");
    marked = link;
  }

  // Passive, because this never prevents the scroll it observes, and reading a
  // rectangle is cheap enough not to need throttling.
  addEventListener("scroll", mark, { passive: true });
  addEventListener("resize", mark, { passive: true });
  mark();
})();
