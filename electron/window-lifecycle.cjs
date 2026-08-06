function createWindowLifecycle(getWindow, quit = () => {}) {
  let isQuitting = false

  function showWindow() {
    const window = getWindow()
    if (!window) return

    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  function handleClose(event) {
    if (isQuitting) return

    event.preventDefault()
    const window = getWindow()
    if (window) window.hide()
  }

  function exit() {
    isQuitting = true
    quit()
  }

  return { showWindow, handleClose, exit }
}

module.exports = { createWindowLifecycle }
