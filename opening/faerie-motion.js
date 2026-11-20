const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * vec2(.5, -.5) + .5;
    gl_Position = vec4(position, 0., 1.);
  }
`;

// The first half of the clip holds RGB, the second half holds the matching matte.
const fragmentSource = `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D frame;
  uniform float inset;
  void main() {
    float y = mix(inset, .5 - inset, uv.y);
    vec3 rgb = texture2D(frame, vec2(uv.x, y)).rgb;
    float alpha = texture2D(frame, vec2(uv.x, y + .5)).r;
    gl_FragColor = vec4(rgb, smoothstep(.018, .985, alpha));
  }
`;

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const inset = gl.getUniformLocation(program, "inset");

  return video => {
    gl.uniform1f(inset, .5 / video.videoHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

export function initFaerieMotion(hero) {
  const video = hero.querySelector("video");
  const canvas = hero.querySelector("canvas");
  if (!video || !canvas) return null;
  const render = createRenderer(canvas);
  if (!render) return null;

  const turnTime = Number(video.dataset.turnTime);
  let phase = "side";
  let failed = false;
  let enabled = false;
  let starting = false;
  let lastFrame = -1;
  video.playbackRate = 3;

  function fallback() {
    failed = true;
    video.pause();
    hero.classList.remove("has-motion");
  }

  function drawFrame() {
    if (!enabled || failed || video.readyState < 2 || video.seeking) return;
    if (video.currentTime === lastFrame && hero.classList.contains("has-motion")) return;
    try {
      render(video);
      lastFrame = video.currentTime;
      hero.classList.add("has-motion");
    } catch {
      fallback();
    }
  }

  video.addEventListener("error", fallback);
  canvas.addEventListener("webglcontextlost", fallback);
  video.addEventListener("loadeddata", drawFrame);
  video.addEventListener("seeked", drawFrame);

  function play() {
    if (!video.paused || video.seeking || starting) return;
    starting = true;
    video.play()
      .catch(error => { if (error.name !== "AbortError") fallback(); })
      .finally(() => { starting = false; });
  }

  return {
    update(faceForward, visible) {
      if (failed || video.error) return false;
      enabled = visible;
      if (!visible) {
        if (!video.paused) video.pause();
        hero.classList.remove("has-motion");
        return false;
      }
      if (video.preload === "none") {
        video.preload = "auto";
        video.load();
      }
      if (phase === "side" && faceForward) phase = "turning";
      if (video.readyState < 2) {
        if (phase === "turning") play();
        return false;
      }

      if (phase === "returning" && video.ended) {
        video.currentTime = 0;
        phase = "side";
      }
      if (phase === "turning" && video.currentTime >= turnTime) {
        video.pause();
        if (video.currentTime > turnTime + .015) video.currentTime = turnTime;
        phase = "front";
      }
      if (phase === "side" && faceForward) phase = "turning";
      if (phase === "front" && !faceForward) phase = "returning";
      if (phase === "turning" || phase === "returning") play();
      drawFrame();
      return !failed && hero.classList.contains("has-motion");
    },
  };
}
