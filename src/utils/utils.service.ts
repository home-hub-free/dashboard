export function getGlobalPosition(element: HTMLElement) {
  let bodyRect = document.body.getBoundingClientRect()
  let elemRect = element.getBoundingClientRect();
  return {
    top: elemRect.top - bodyRect.top,
    left: elemRect.left - bodyRect.left,
    width: elemRect.width,
    height: elemRect.height
  }
}