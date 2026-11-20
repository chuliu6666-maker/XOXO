(() => {
  // site/opening/pearl-nav-hover.js
  var STEP = 1 / 120;
  var INFLATION_FREQUENCY = 12;
  var WAKE_GAIN = 0.08;
  var CANVAS_SCALE = 1.24;
  var vertexSource = `
  attribute vec2 position;
  varying vec2 uv;

  void main() {
    uv = position * vec2(.5, -.5) + .5;
    gl_Position = vec4(position, 0., 1.);
  }
`;
  var fragmentSource = `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D pearl;
  uniform vec2 cursor;
  uniform float aspect;
  uniform float puff;
  uniform float press;
  uniform float wake;
  uniform float canvasScale;

  void main() {
    vec2 point = (uv - .5) * canvasScale + .5;
    vec2 distanceToCursor = (point - cursor) * vec2(aspect, 1.);
    // The local swell follows the cursor, with a shoulder about .45 heights wide.
    float swell = exp(-dot(distanceToCursor, distanceToCursor) / .405);
    float localPuff = puff * (1. + .30 * wake);
    float size = 1. + .05 * puff - .035 * press;
    vec2 lift = vec2(
      (cursor.x - .5) * .075 + (point.x - .5) * .036,
      (point.y - .5) * .105 + (cursor.y - .5) * .045
    );
    point = (point - .5) / size + .5 - lift * swell * localPuff;
    point.y += (point.y - .5) * .12 * press * swell;

    if (any(lessThan(point, vec2(0.))) || any(greaterThan(point, vec2(1.)))) {
      gl_FragColor = vec4(0.);
      return;
    }

    vec4 pixel = texture2D(pearl, point);
    gl_FragColor = pixel;
  }
`;
  function createWarp(image) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl || gl.isContextLost()) return null;
    const program = gl.createProgram();
    for (const [kind, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(position);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    if (gl.getError() !== gl.NO_ERROR) return null;
    const uniforms = Object.fromEntries(["cursor", "aspect", "puff", "press", "wake", "canvasScale"].map((name) => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1f(uniforms.canvasScale, CANVAS_SCALE);
    canvas.className = "relic-nav-warp";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    return {
      canvas,
      draw(width, height, x, y, puff, press, wake) {
        if (gl.isContextLost()) return false;
        const ratio = Math.min(window.devicePixelRatio || 1, 2) * CANVAS_SCALE;
        const canvasWidth = Math.max(1, Math.round(width * ratio));
        const canvasHeight = Math.max(1, Math.round(height * ratio));
        if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.cursor, x, y);
        gl.uniform1f(uniforms.aspect, width / height);
        gl.uniform1f(uniforms.puff, puff);
        gl.uniform1f(uniforms.press, press);
        gl.uniform1f(uniforms.wake, wake);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      }
    };
  }
  function bindPearlNavHover(nav, reduced) {
    const surfaces = [...nav.querySelectorAll(".relic-nav-surface")].map((surface) => {
      const target = surface.parentElement;
      const image = surface.querySelector("img");
      let warp;
      let frame = 0, last = 0, accumulator = 0, pointerTime = 0;
      let x = 0.5, y = 0.5, targetX = 0.5, targetY = 0.5;
      let puff = 0, puffVelocity = 0, press = 0, pressVelocity = 0, wake = 0;
      let hovering = false, pressing = false;
      function stop() {
        cancelAnimationFrame(frame);
        frame = last = accumulator = pointerTime = 0;
        puff = puffVelocity = press = pressVelocity = wake = 0;
        surface.classList.remove("is-warping");
        image.style.removeProperty("transform");
        image.style.removeProperty("transform-origin");
        if (warp) warp.canvas.hidden = true;
      }
      function update(now) {
        frame = 0;
        if (reduced.matches || target.closest("[hidden]")) {
          stop();
          return;
        }
        const dt = last ? Math.min((now - last) / 1e3, 0.05) : STEP;
        last = now;
        accumulator += dt;
        const inflateTarget = hovering ? 1 : 0;
        const pressTarget = pressing ? 1 : 0;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          puffVelocity += (INFLATION_FREQUENCY ** 2 * (inflateTarget - puff) - 1.5 * INFLATION_FREQUENCY * puffVelocity) * STEP;
          puff += puffVelocity * STEP;
          const pressFrequency = pressing ? 36 : 20;
          pressVelocity += (pressFrequency ** 2 * (pressTarget - press) - 1.2 * pressFrequency * pressVelocity) * STEP;
          press += pressVelocity * STEP;
          x += (targetX - x) * 0.16;
          y += (targetY - y) * 0.16;
          wake *= 0.95;
        }
        const settled = Math.abs(puff - inflateTarget) < 3e-3 && Math.abs(puffVelocity) < 0.025 && Math.abs(press - pressTarget) < 3e-3 && Math.abs(pressVelocity) < 0.025 && Math.abs(x - targetX) + Math.abs(y - targetY) + wake < 8e-3;
        if (settled && !hovering && !pressing) {
          stop();
          return;
        }
        if (warp === void 0 && image.complete && image.naturalWidth) {
          try {
            warp = createWarp(image);
          } catch {
            warp = null;
          }
          if (warp) {
            const { canvas } = warp;
            surface.append(canvas);
            canvas.addEventListener("webglcontextlost", () => {
              canvas.remove();
              warp = null;
              surface.classList.remove("is-warping");
              if (hovering || pressing) schedule();
            }, { once: true });
          }
        }
        const width = surface.clientWidth;
        const height = surface.clientHeight;
        if (warp && width && height && warp.draw(width, height, x, y, puff, press, wake)) {
          warp.canvas.hidden = false;
          surface.classList.add("is-warping");
        } else {
          surface.classList.remove("is-warping");
          if (warp) warp.canvas.hidden = true;
          image.style.transformOrigin = `${x * 100}% ${y * 100}%`;
          image.style.transform = `scale(${1 + 0.05 * puff - 0.035 * press}, ${1 + 0.1 * puff - 0.07 * press})`;
        }
        if (!settled) frame = requestAnimationFrame(update);
        else last = accumulator = 0;
      }
      function schedule() {
        if (!frame && !reduced.matches) frame = requestAnimationFrame(update);
      }
      function move(event) {
        if (event.pointerType === "touch" || reduced.matches) return;
        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nextX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const nextY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        if (pointerTime) {
          const elapsed = Math.max(0.016, (event.timeStamp - pointerTime) / 1e3);
          const speed = Math.hypot((nextX - targetX) * rect.width / rect.height, nextY - targetY) / elapsed;
          wake = Math.max(wake, Math.min(1, WAKE_GAIN * speed));
        }
        targetX = nextX;
        targetY = nextY;
        pointerTime = event.timeStamp;
        hovering = true;
        pressing = (event.buttons & 1) !== 0;
        schedule();
      }
      function leave() {
        hovering = pressing = false;
        pointerTime = 0;
        schedule();
      }
      for (const eventName of ["pointerenter", "pointermove", "pointerdown", "pointerup"]) {
        target.addEventListener(eventName, move, { passive: true });
      }
      target.addEventListener("pointerleave", leave);
      target.addEventListener("pointercancel", leave);
      return () => {
        if (reduced.matches || target.closest("[hidden]")) {
          hovering = pressing = false;
          stop();
        }
      };
    });
    function resetUnavailable() {
      surfaces.forEach((reset) => reset());
    }
    reduced.addEventListener("change", resetUnavailable);
    const menu = nav.querySelector('[data-fx="menu"]');
    new MutationObserver(resetUnavailable).observe(menu, {
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  // site/opening/home-interactions.js
  var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  var damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
  var smooth = (value) => value * value * (3 - 2 * value);
  function initHomeFX(stage = document.querySelector('[data-fx="stage"]')) {
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
      glide: 0
    }));
    const propsByElement = new Map(props.map((prop) => [prop.element, prop]));
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
        height: bounds.height
      };
      const portrait = hero.querySelector("img").getBoundingClientRect();
      const pictureWidth = portrait.width;
      const pictureHeight = portrait.height;
      const pictureLeft = portrait.left - stageBox.left;
      const pictureTop = portrait.top - stageBox.top;
      const narrow = windowBox.width < windowBox.height;
      person = {
        center: pictureLeft + pictureWidth * 0.5,
        left: pictureLeft + pictureWidth * (narrow ? 0.35 : 0.11),
        right: pictureLeft + pictureWidth * (narrow ? 0.72 : 0.91),
        top: pictureTop + pictureHeight * 0.14,
        bottom: pictureTop + pictureHeight
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
        halfWidth,
        halfHeight,
        left: windowBox.left + halfWidth + 5 - prop.cx,
        right: windowBox.right - halfWidth - 5 - prop.cx,
        top: windowBox.top + halfHeight + 5 - prop.cy,
        bottom: windowBox.bottom - halfHeight - 5 - prop.cy
      };
    }
    function placeProp(prop, x, y, bounds = propBounds(prop)) {
      prop.y = clamp(y, bounds.top, bounds.bottom);
      let { left, right } = bounds;
      if (prop.cy + prop.y - bounds.halfHeight < person.bottom && prop.cy + prop.y + bounds.halfHeight > person.top) {
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
          const decay = Math.exp(-9 * dt);
          const travel = (1 - decay) / 9;
          prop.glide -= dt;
          prop.sway = damp(prop.sway, 0, 5, dt);
          placeProp(prop, prop.x + prop.vx * travel, prop.y + prop.vy * travel);
          prop.vx *= decay;
          prop.vy *= decay;
          continue;
        }
        const fieldDepth = 0.22 + prop.depth * 0.47;
        const anchorX = fieldX * fieldDepth;
        const anchorY = fieldY * fieldDepth;
        const scale = prop.depth * range;
        let x = anchorX + (Math.sin(time * 0.82 + prop.phase) * 19 - px * (hover ? 118 : 84)) * scale;
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
            const restingDistance = Math.hypot(prop.cx + anchorX - pointer.x, prop.cy + anchorY - pointer.y);
            const proximity = smooth(clamp(1 - Math.min(distance, restingDistance) / (330 * range), 0, 1));
            const swing = time * 4.4 + prop.phase;
            x += Math.sin(swing) * proximity * 36 * scale;
            y += Math.cos(swing * 1.13) * proximity * 44 * scale;
            hoverSway = Math.sin(swing + 0.6) * proximity * 15;
          }
        }
        const sway = Math.sin(time * 0.85 + prop.phase) * 4 + x * 0.055 + hoverSway;
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
        fieldY
      };
    }
    function moveDrag(event) {
      const { prop } = drag;
      const dt = (event.timeStamp - drag.lastTime) / 1e3;
      if (dt > 0) {
        const vx = clamp((event.clientX - drag.lastX) / dt, -1700, 1700);
        const vy = clamp((event.clientY - drag.lastY) / dt, -1700, 1700);
        prop.vx = damp(prop.vx, vx, 28, dt);
        prop.vy = damp(prop.vy, vy, 28, dt);
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        drag.lastTime = event.timeStamp;
        if (!reduced.matches) prop.sway = damp(prop.sway, clamp(prop.vx * 0.012, -16, 16), 18, dt);
      }
      placeProp(prop, event.clientX + drag.offsetX, event.clientY + drag.offsetY);
      if (!reduced.matches) {
        const limitX = windowBox.width * 0.28;
        const limitY = windowBox.height * 0.25;
        fieldX = clamp(drag.fieldX + (event.clientX - drag.startX) * 0.78, -limitX, limitX);
        fieldY = clamp(drag.fieldY + (event.clientY - drag.startY) * 0.78, -limitY, limitY);
      }
    }
    function finishDrag(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const { prop, lastTime } = drag;
      drag = null;
      delete prop.element.dataset.dragging;
      if (event.type === "pointerup" && event.timeStamp - lastTime < 100 && Math.hypot(prop.vx, prop.vy) > 95 && !reduced.matches) {
        prop.glide = 0.28;
        fieldX = clamp(fieldX + prop.vx * 0.055, -windowBox.width * 0.28, windowBox.width * 0.28);
        fieldY = clamp(fieldY + prop.vy * 0.055, -windowBox.height * 0.25, windowBox.height * 0.25);
      }
      if (reduced.matches) placeProp(prop, 0, 0);
    }
    function tick(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1e3) : 0.016;
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
    nav.addEventListener("pointerdown", (event) => event.stopPropagation());
    nav.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.hidden && !nav.contains(event.target)) setMenu(false, menu.contains(document.activeElement));
    });
    nav.addEventListener("focusout", (event) => {
      if (!menu.hidden && event.relatedTarget && !nav.contains(event.relatedTarget)) setMenu(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) setMenu(false, true);
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false, true);
    });
    bindPearlNavHover(nav, reduced);
    stage.addEventListener("pointerdown", startDrag);
    stage.addEventListener("dragstart", (event) => {
      if (propsByElement.has(event.target)) event.preventDefault();
    });
    viewport.addEventListener("pointermove", (event) => {
      if (drag?.id === event.pointerId) {
        moveDrag(event);
        return;
      }
      if (event.pointerType !== "touch") readPointer(event);
    }, { passive: true });
    viewport.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") pointer = null;
    });
    for (const eventName of ["pointerup", "pointercancel"]) {
      viewport.addEventListener(eventName, (event) => {
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
})();
