import { bindPearlNavHover } from "./pearl-nav-hover.js?v=original-color";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const smooth = value => value * value * (3 - 2 * value);

export function initHomeFX(stage = document.querySelector('[data-fx="stage"]')) {
  if (!stage) return;

  const viewport = stage.closest(".relic-hero");
  const hero = stage.querySelector('[data-fx="hero"]');
  const nav = stage.querySelector('[data-fx="nav"]');
  const button = nav.querySelector("button");
  const menu = nav.querySelector('[data-fx="menu"]');
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const props = [...stage.querySelectorAll('[data-fx="prop"]')].map((element, index) => ({
    element,
    depth: Number(element.dataset.depth) || 1,
    phase: index * 2.399,
    x: 0,
    y: 0,
    sway: 0,
    vx: 0,
    vy: 0,
    glide: 0,
  }));
  const propsByElement = new Map(props.map(prop => [prop.element, prop]));

  let stageBox, windowBox, person;
  let pointer = null;
  let frameId = 0;
  let last = 0;
  let time = 0;
  let inView = false;
  let drag = null;
  let fieldX = 0;
  let fieldY = 0;

  function measure() {
    stageBox = stage.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    windowBox = {
      left: bounds.left - stageBox.left,
      right: bounds.right - stageBox.left,
      top: bounds.top - stageBox.top,
      bottom: bounds.bottom - stageBox.top,
      width: bounds.width,
      height: bounds.height,
    };
    const portrait = hero.querySelector("img").getBoundingClientRect();
    const pictureWidth = portrait.width;
    const pictureHeight = portrait.height;
    const pictureLeft = portrait.left - stageBox.left;
    const pictureTop = portrait.top - stageBox.top;
    const narrow = windowBox.width < windowBox.height;
    person = {
      center: pictureLeft + pictureWidth * .5,
      left: pictureLeft + pictureWidth * (narrow ? .35 : .11),
      right: pictureLeft + pictureWidth * (narrow ? .72 : .91),
      top: pictureTop + pictureHeight * .14,
      bottom: pictureTop + pictureHeight,
    };
    for (const prop of props) {
      const rect = prop.element.getBoundingClientRect();
      prop.cx = rect.left - stageBox.left - prop.x + rect.width / 2;
      prop.cy = rect.top - stageBox.top - prop.y + rect.height / 2;
      prop.width = prop.element.offsetWidth;
      prop.height = prop.element.offsetHeight;
      prop.angle = parseFloat(getComputedStyle(prop.element).getPropertyValue("--angle")) || 0;
      prop.side = prop.cx < person.center ? -1 : 1;
    }
  }

  function readPointer(event) {
    const rect = stage.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, hover: event.pointerType !== "touch" };
  }

  function propBounds(prop) {
    const angle = (prop.angle + prop.sway) * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const width = cos * prop.width + sin * prop.height;
    const height = sin * prop.width + cos * prop.height;
    const sideWidth = prop.side < 0 ? person.left - windowBox.left : windowBox.right - person.right;
    const scale = Math.min(1, Math.max(1, sideWidth - 13) / width);
    const halfWidth = width / 2 * scale;
    const halfHeight = height / 2 * scale;
    return {
      scale,
      halfWidth, halfHeight,
      left: windowBox.left + halfWidth + 5 - prop.cx,
      right: windowBox.right - halfWidth - 5 - prop.cx,
      top: windowBox.top + halfHeight + 5 - prop.cy,
      bottom: windowBox.bottom - halfHeight - 5 - prop.cy,
    };
  }

  function placeProp(prop, x, y, bounds = propBounds(prop)) {
    prop.y = clamp(y, bounds.top, bounds.bottom);
    let { left, right } = bounds;
    if (prop.cy + prop.y - bounds.halfHeight < person.bottom
        && prop.cy + prop.y + bounds.halfHeight > person.top) {
      if (prop.side < 0) right = Math.min(right, person.left - prop.cx - bounds.halfWidth - 5);
      else left = Math.max(left, person.right - prop.cx + bounds.halfWidth + 5);
    }
    prop.x = clamp(x, left, right);
    prop.element.style.setProperty("--drift-x", `${prop.x.toFixed(2)}px`);
    prop.element.style.setProperty("--drift-y", `${prop.y.toFixed(2)}px`);
    prop.element.style.setProperty("--sway", `${prop.sway.toFixed(2)}deg`);
    prop.element.style.setProperty("--prop-scale", String(bounds.scale));
  }

  function floatProps(dt) {
    const range = Math.min(1.4, windowBox.width / 900);
    const px = pointer ? clamp((pointer.x - windowBox.left) / windowBox.width * 2 - 1, -1, 1) : 0;
    const py = pointer ? clamp((pointer.y - windowBox.top) / windowBox.height * 2 - 1, -1, 1) : 0;
    const hover = pointer?.hover && !drag && menu.hidden;
    const follow = hover ? 8 : 6;
    for (const prop of props) {
      if (drag?.prop === prop) continue;
      if (prop.glide > 0) {
        // Interact.js inertia uses release velocity and exponential resistance.
        const decay = Math.exp(-9 * dt);
        const travel = (1 - decay) / 9;
        prop.glide -= dt;
        prop.sway = damp(prop.sway, 0, 5, dt);
        placeProp(prop, prop.x + prop.vx * travel, prop.y + prop.vy * travel);
        prop.vx *= decay;
        prop.vy *= decay;
        continue;
      }

      const fieldDepth = .22 + prop.depth * .47;
      const anchorX = fieldX * fieldDepth;
      const anchorY = fieldY * fieldDepth;
      const scale = prop.depth * range;
      let x = anchorX + (Math.sin(time * .82 + prop.phase) * 19 - px * (hover ? 118 : 84)) * scale;
      let y = anchorY + (Math.cos(time * 1.05 + prop.phase) * 25 - py * (hover ? 104 : 72)) * scale;
      let hoverSway = 0;
      if (pointer) {
        const dx = prop.cx + prop.x - pointer.x;
        const dy = prop.cy + prop.y - pointer.y;
        const distance = Math.hypot(dx, dy) || 1;
        const repel = Math.max(0, 1 - distance / ((hover ? 300 : 245) * range)) ** 2 * (hover ? 160 : 105) * range;
        x += dx / distance * repel;
        y += dy / distance * repel;
        if (hover) {
          // Use the resting center so the swing doesn't cut out as the object moves away.
          const restingDistance = Math.hypot(prop.cx + anchorX - pointer.x, prop.cy + anchorY - pointer.y);
          const proximity = smooth(clamp(1 - Math.min(distance, restingDistance) / (330 * range), 0, 1));
          const swing = time * 4.4 + prop.phase;
          x += Math.sin(swing) * proximity * 36 * scale;
          y += Math.cos(swing * 1.13) * proximity * 44 * scale;
          hoverSway = Math.sin(swing + .6) * proximity * 15;
        }
      }
      const sway = Math.sin(time * .85 + prop.phase) * 4 + x * .055 + hoverSway;
      const swayLimit = hover ? 21 : 11;
      prop.sway = damp(prop.sway, clamp(sway, -swayLimit, swayLimit), follow, dt);
      const bounds = propBounds(prop);
      const targetX = clamp(x, bounds.left, bounds.right);
      placeProp(prop, damp(prop.x, targetX, follow, dt), damp(prop.y, y, follow, dt), bounds);
    }
  }

  function startDrag(event) {
    const prop = propsByElement.get(event.target);
    if (!prop || drag || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    prop.element.setPointerCapture(event.pointerId);
    prop.element.dataset.dragging = "";
    prop.glide = prop.vx = prop.vy = 0;
    drag = {
      prop,
      id: event.pointerId,
      offsetX: prop.x - event.clientX,
      offsetY: prop.y - event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
      fieldX,
      fieldY,
    };
  }

  function moveDrag(event) {
    const { prop } = drag;
    const dt = (event.timeStamp - drag.lastTime) / 1000;
    if (dt > 0) {
      const vx = clamp((event.clientX - drag.lastX) / dt, -1700, 1700);
      const vy = clamp((event.clientY - drag.lastY) / dt, -1700, 1700);
      prop.vx = damp(prop.vx, vx, 28, dt);
      prop.vy = damp(prop.vy, vy, 28, dt);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;
      if (!reduced.matches) prop.sway = damp(prop.sway, clamp(prop.vx * .012, -16, 16), 18, dt);
    }
    placeProp(prop, event.clientX + drag.offsetX, event.clientY + drag.offsetY);
    if (!reduced.matches) {
      const limitX = windowBox.width * .28;
      const limitY = windowBox.height * .25;
      fieldX = clamp(drag.fieldX + (event.clientX - drag.startX) * .78, -limitX, limitX);
      fieldY = clamp(drag.fieldY + (event.clientY - drag.startY) * .78, -limitY, limitY);
    }
  }

  function finishDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const { prop, lastTime } = drag;
    drag = null;
    delete prop.element.dataset.dragging;
    if (event.type === "pointerup" && event.timeStamp - lastTime < 100
        && Math.hypot(prop.vx, prop.vy) > 95 && !reduced.matches) {
      prop.glide = .28;
      fieldX = clamp(fieldX + prop.vx * .055, -windowBox.width * .28, windowBox.width * .28);
      fieldY = clamp(fieldY + prop.vy * .055, -windowBox.height * .25, windowBox.height * .25);
    }
    if (reduced.matches) placeProp(prop, 0, 0);
  }

  function tick(now) {
    const dt = last ? Math.min(.05, (now - last) / 1000) : .016;
    last = now;
    time += dt;
    floatProps(dt);
    frameId = requestAnimationFrame(tick);
  }

  function syncMotion() {
    cancelAnimationFrame(frameId);
    last = 0;
    if (reduced.matches) {
      fieldX = fieldY = 0;
      for (const prop of props) {
        if (drag?.prop === prop) continue;
        prop.x = prop.y = prop.sway = 0;
        prop.glide = prop.vx = prop.vy = 0;
        placeProp(prop, 0, 0);
      }
    } else if (inView && !document.hidden) {
      frameId = requestAnimationFrame(tick);
    }
  }

  function setMenu(open, restoreFocus = false) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("a").focus({ preventScroll: true });
    else if (restoreFocus) button.focus({ preventScroll: true });
    if (reduced.matches) syncMotion();
  }

  button.addEventListener("click", () => setMenu(menu.hidden, true));
  nav.addEventListener("pointerdown", event => event.stopPropagation());
  nav.addEventListener("wheel", event => event.stopPropagation(), { passive: true });
  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !nav.contains(event.target)) setMenu(false, menu.contains(document.activeElement));
  });
  nav.addEventListener("focusout", event => {
    if (!menu.hidden && event.relatedTarget && !nav.contains(event.relatedTarget)) setMenu(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) setMenu(false, true);
  });
  menu.addEventListener("click", event => {
    if (event.target.closest("a")) setMenu(false, true);
  });
  bindPearlNavHover(nav, reduced);

  stage.addEventListener("pointerdown", startDrag);
  stage.addEventListener("dragstart", event => {
    if (propsByElement.has(event.target)) event.preventDefault();
  });
  viewport.addEventListener("pointermove", event => {
    if (drag?.id === event.pointerId) {
      moveDrag(event);
      return;
    }
    if (event.pointerType !== "touch") readPointer(event);
  }, { passive: true });
  viewport.addEventListener("pointerleave", event => {
    if (event.pointerType !== "touch") pointer = null;
  });
  for (const eventName of ["pointerup", "pointercancel"]) {
    viewport.addEventListener(eventName, event => {
      finishDrag(event);
      if (eventName === "pointercancel") pointer = null;
    }, { passive: true });
  }
  viewport.addEventListener("lostpointercapture", finishDrag);
  measure();
  const resize = new ResizeObserver(() => {
    measure();
    if (reduced.matches) syncMotion();
  });
  resize.observe(stage);
  resize.observe(viewport);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) {
      pointer = null;
      setMenu(false);
    }
    syncMotion();
  }).observe(stage);
  document.addEventListener("visibilitychange", syncMotion);
  reduced.addEventListener("change", syncMotion);
  syncMotion();
}

initHomeFX();
