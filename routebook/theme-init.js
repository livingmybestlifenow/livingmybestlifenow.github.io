(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('routebook-theme') === 'light') theme = 'light';
  } catch (error) {
    theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f3efe4' : '#12140f');
})();
