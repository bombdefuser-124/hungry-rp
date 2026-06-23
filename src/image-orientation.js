const PORTRAIT_RATIO = 1.12;
const LANDSCAPE_RATIO = 1.12;

export function wireImageOrientation(root = document) {
  root.querySelectorAll('img[data-detect-orientation]').forEach(img => {
    const apply = () => applyImageOrientation(img);
    if (img.complete && img.naturalWidth && img.naturalHeight) apply();
    else img.addEventListener('load', apply, { once: true });
  });
}

function applyImageOrientation(img) {
  const frame = img.closest('.image-frame');
  if (!frame || !img.naturalWidth || !img.naturalHeight) return;
  const portrait = img.naturalHeight > img.naturalWidth * PORTRAIT_RATIO;
  const landscape = img.naturalWidth > img.naturalHeight * LANDSCAPE_RATIO;
  frame.classList.toggle('portrait-image', portrait);
  frame.classList.toggle('landscape-image', landscape);
  frame.classList.toggle('square-image', !portrait && !landscape);
}
