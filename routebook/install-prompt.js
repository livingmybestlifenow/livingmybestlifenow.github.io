(function () {
  window.__routebookInstallEvent = null
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault()
    window.__routebookInstallEvent = event
    window.dispatchEvent(new Event('routebook-install-ready'))
  })
  window.addEventListener('appinstalled', function () {
    window.__routebookInstallEvent = null
    window.dispatchEvent(new Event('routebook-installed'))
  })
})()
