(function() {
  // Prevent gesture-based zoom (multi-touch)
  function preventZoom(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }
  document.addEventListener('touchstart', preventZoom, { passive: false });
  document.addEventListener('touchmove', preventZoom, { passive: false });
})();