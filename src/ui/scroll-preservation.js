export const renderPreservingScroll = (render, viewport = window) => {
  const scrollX = viewport.scrollX;
  const scrollY = viewport.scrollY;
  render();
  viewport.requestAnimationFrame(() => viewport.scrollTo(scrollX, scrollY));
};
