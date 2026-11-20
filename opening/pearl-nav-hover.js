// PNG surface motion adapted from Originkit's Velour Bolster.
const STEP = 1 / 120;
const INFLATION_FREQUENCY = 12;
const WAKE_GAIN = .08;
const CANVAS_SCALE = 1.24;

const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;

  void main() {
    uv = position * vec2(.5, -.5) + .5;
    gl_Position = vec4(position, 0., 1.);
  }
`;

const fragmentSource = `
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

  const uniforms = Object.fromEntries(["cursor", "aspect", "puff", "press", "wake", "canvasScale"]
    .map(name => [name, gl.getUniformLocation(program, name)]));
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
    },
  };
}

export function bindPearlNavHover(nav, reduced) {
  const surfaces = [...nav.querySelectorAll(".relic-nav-surface")].map(surface => {
    const target = surface.parentElement;
    const image = surface.querySelector("img");
    let warp;
    let frame = 0, last = 0, accumulator = 0, pointerTime = 0;
    let x = .5, y = .5, targetX = .5, targetY = .5;
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

      const dt = last ? Math.min((now - last) / 1000, .05) : STEP;
      last = now;
      accumulator += dt;
      const inflateTarget = hovering ? 1 : 0;
      const pressTarget = pressing ? 1 : 0;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        // Fixed 120 Hz spring from Velour Bolster, with a little overshoot on release.
        puffVelocity += (INFLATION_FREQUENCY ** 2 * (inflateTarget - puff)
          - 1.5 * INFLATION_FREQUENCY * puffVelocity) * STEP;
        puff += puffVelocity * STEP;
        const pressFrequency = pressing ? 36 : 20;
        pressVelocity += (pressFrequency ** 2 * (pressTarget - press) - 1.2 * pressFrequency * pressVelocity) * STEP;
        press += pressVelocity * STEP;
        x += (targetX - x) * .16;
        y += (targetY - y) * .16;
        wake *= .95;
      }

      const settled = Math.abs(puff - inflateTarget) < .003 && Math.abs(puffVelocity) < .025
        && Math.abs(press - pressTarget) < .003 && Math.abs(pressVelocity) < .025
        && Math.abs(x - targetX) + Math.abs(y - targetY) + wake < .008;
      if (settled && !hovering && !pressing) {
        stop();
        return;
      }

      if (warp === undefined && image.complete && image.naturalWidth) {
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
        image.style.transform = `scale(${1 + .05 * puff - .035 * press}, ${1 + .10 * puff - .07 * press})`;
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
        const elapsed = Math.max(.016, (event.timeStamp - pointerTime) / 1000);
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
    surfaces.forEach(reset => reset());
  }

  reduced.addEventListener("change", resetUnavailable);
  const menu = nav.querySelector('[data-fx="menu"]');
  new MutationObserver(resetUnavailable).observe(menu, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
}
