(() => {
  const selector = "[data-article-scroll-progress]";
  const valueAttribute = "data-article-scroll-progress-value";
  const progressElements = Array.from(document.querySelectorAll(selector));

  if (progressElements.length === 0) {
    return;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const documentElement = document.documentElement;
  const body = document.body;

  const scrollTop = () => (
    window.scrollY
    || window.pageYOffset
    || documentElement.scrollTop
    || (body ? body.scrollTop : 0)
    || 0
  );

  const viewportHeight = () => Math.max(
    0,
    window.innerHeight || documentElement.clientHeight || 0
  );

  const scrollHeight = () => Math.max(
    documentElement.scrollHeight || 0,
    documentElement.offsetHeight || 0,
    body ? body.scrollHeight || 0 : 0,
    body ? body.offsetHeight || 0 : 0
  );

  const maxScroll = () => Math.max(0, scrollHeight() - viewportHeight());

  const articleContent = () => (
    document.querySelector("[data-article-scroll-content]")
  );

  const progressRange = () => {
    const max = maxScroll();
    const content = articleContent();

    if (!content || typeof content.getBoundingClientRect !== "function") {
      return { start: 0, end: max };
    }

    const currentScroll = scrollTop();
    const rect = content.getBoundingClientRect();
    const contentTop = currentScroll + rect.top;
    const contentBottom = currentScroll + rect.bottom;
    const start = clamp(contentTop, 0, max);
    const end = clamp(contentBottom - viewportHeight(), start, max);

    if (end > start) {
      return { start, end };
    }

    return { start: 0, end: max };
  };

  const currentProgress = () => {
    const range = progressRange();
    const distance = range.end - range.start;

    if (distance <= 0) {
      return 100;
    }

    return clamp(((scrollTop() - range.start) / distance) * 100, 0, 100);
  };

  const writeProgress = () => {
    const value = String(Math.round(currentProgress()));
    progressElements.forEach((element) => {
      element.style.setProperty("--article-scroll-progress", `${value}%`);
      element.setAttribute(valueAttribute, value);
      element.setAttribute("aria-valuenow", value);
    });
  };

  let scheduled = false;
  const scheduleWrite = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    const schedule = typeof window.requestAnimationFrame === "function"
      ? (callback) => window.requestAnimationFrame(callback)
      : (callback) => window.setTimeout(callback, 16);

    schedule(() => {
      scheduled = false;
      writeProgress();
    });
  };

  window.addEventListener("scroll", scheduleWrite, { passive: true });
  window.addEventListener("resize", scheduleWrite);
  window.addEventListener("pageshow", scheduleWrite);
  scheduleWrite();
})();
