(function () {
  const min_screen_width = 575;
  
  // Fix min witdth for small devices
  window.onload = function () {
    if (screen.width < min_screen_width) {
      var mvp = document.getElementById('viewp');
      mvp.setAttribute('content', 'user-scalable=no,width='+min_screen_width);
    }
    document.addEventListener('touchstart', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });
  }

  // Prevent gesture-based zoom (multi-touch)
  function preventZoom(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }

})();