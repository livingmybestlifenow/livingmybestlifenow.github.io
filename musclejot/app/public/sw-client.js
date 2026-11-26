;(function () {
  if (!('serviceWorker' in navigator)) return
  var hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) {
      hadController = true
      return
    }
    window.location.reload()
  })
  function poke() {
    navigator.serviceWorker.getRegistration('/musclejot/').then(function (registration) {
      if (registration) registration.update()
    })
  }
  window.addEventListener('load', poke)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') poke()
  })
})()
