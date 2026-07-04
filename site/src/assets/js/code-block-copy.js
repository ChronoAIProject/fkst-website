(() => {
  const wrappers = Array.from(document.querySelectorAll("[data-code-block-copy]"));
  if (wrappers.length === 0) {
    return;
  }

  const idleLabel = "Copy";
  const copiedLabel = "Copied";
  const failedLabel = "Copy failed";
  const resetDelay = 1600;
  const requiredSourceAttributes = [
    "data-code-block-copy-text",
    "data-code-block-copy-language",
    "data-code-block-copy-info",
    "data-code-block-copy-kind"
  ];

  const hasSourceContract = (wrapper) => requiredSourceAttributes
    .every((attribute) => wrapper.hasAttribute(attribute));

  const copyWithFallback = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.inset = "0 auto auto 0";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.append(textArea);
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    try {
      if (!document.execCommand("copy")) {
        throw new Error("copy command rejected");
      }
    } finally {
      textArea.remove();
    }
  };

  const writeClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        copyWithFallback(text);
        return;
      }
    }

    copyWithFallback(text);
  };

  wrappers.forEach((wrapper) => {
    const button = wrapper.querySelector("[data-code-block-copy-button]");
    const status = wrapper.querySelector("[data-code-block-copy-status]");
    let resetTimer = 0;

    if (!(button instanceof HTMLButtonElement) || !status || !hasSourceContract(wrapper)) {
      return;
    }

    const text = wrapper.getAttribute("data-code-block-copy-text") || "";

    const setIdle = () => {
      button.textContent = idleLabel;
      button.removeAttribute("data-copy-state");
      wrapper.removeAttribute("data-copy-state");
      status.textContent = "";
    };

    const setState = (state, label) => {
      window.clearTimeout(resetTimer);
      button.textContent = label;
      button.setAttribute("data-copy-state", state);
      wrapper.setAttribute("data-copy-state", state);
      status.textContent = label;
      resetTimer = window.setTimeout(setIdle, resetDelay);
    };

    button.disabled = false;
    button.hidden = false;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await writeClipboard(text);
        setState("copied", copiedLabel);
      } catch {
        setState("failed", failedLabel);
      } finally {
        button.disabled = false;
      }
    });
  });
})();
