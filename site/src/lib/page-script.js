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
