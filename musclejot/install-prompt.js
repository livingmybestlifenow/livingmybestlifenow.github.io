(function () {
  window.__musclejotInstallEvent = null
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault()
    window.__musclejotInstallEvent = event
    window.dispatchEvent(new Event('musclejot-install-ready'))
  })
  window.addEventListener('appinstalled', function () {
    window.__musclejotInstallEvent = null
    window.dispatchEvent(new Event('musclejot-installed'))
  })
})()
