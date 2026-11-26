(function () {
  window.__stubjotInstallEvent = null
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault()
    window.__stubjotInstallEvent = event
    window.dispatchEvent(new Event('stubjot-install-ready'))
  })
  window.addEventListener('appinstalled', function () {
    window.__stubjotInstallEvent = null
    window.dispatchEvent(new Event('stubjot-installed'))
  })
})()
