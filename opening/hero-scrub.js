/**
 * HeroScrub — 首屏人物视频「拖拽 / 滚轮 / 触摸」逐帧交互
 * 支持原始 video 或图片序列；输入改变 target 帧号，rAF 平滑追赶并保留松手惯性。
 * 思路融合自：
 *  - ertdfgcvb/Sequencer（图片序列播放 + incremental drag）
 *  - Apple 式 canvas 序列帧 scrub（21st.dev Scrubbable Video Reveal / GSAP ScrollTrigger 通用做法）
 *  - GifScratcher（pointer 事件驱动帧选择、touch-action 处理）
 *  - 视频 scrub 社区经验：拖拽高频事件不要直接 seek <video>，用预解码帧 + 合并绘制
 * 无依赖，原生 ES Module。
 */
export class HeroScrub {
  constructor(root, options = {}) {
    this.root = root;
    this.o = {
      frameCount: 301,
      frameUrl: (i) => new URL(`../assets/hero-relics/frames-0419-black/f_${String(i + 1).padStart(4, '0')}.webp`, import.meta.url),
      fit: 'contain',        // 'contain' 人物完整居中（竖版视频推荐）| 'cover' 铺满裁切
      dragSensitivity: 1,    // 1 = 水平拖满整个首屏宽度 ≈ 播完整段；调大更灵敏
      wheelSpeed: 0.12,      // 每像素滚轮对应的帧数
      keySpeed: 4,           // 方向键每次前进的帧数
      smoothing: 0.16,       // 0~1，越小越"拖泥带水"，越大越跟手
      inertia: 0.92,         // 松手后惯性衰减，0 = 无惯性
      invert: false,         // true = 向左拖前进
      captureWheel: true,    // 滚轮在首屏内驱动人物；到头/到尾后把滚动还给页面
      startProgress: 0,      // 0~1 初始位置
      concurrency: 6,        // 预加载并发数
      preloadRadius: 12,
      previewStep: 12,
      retentionRadius: 20,
      canvas: null,          // 可将画布放在与手势区域分离的人物层
      video: null,           // 直接控制原视频时无需生成和压缩序列帧
      frameRate: 30,
      background: 'transparent',
      onProgress: null,      // (p: 0~1, frame: number) => void  可用来联动周围元素
      onFirstInteract: null,
      ...options,
    };

    const n = this.o.frameCount;
    this.frames = new Array(n);
    this.pending = new Set();
    this.unavailable = new Set();
    this.requested = Math.round(this.o.startProgress * (n - 1));
    this.firstIdx = this.requested;
    this.target = this.current = this.o.startProgress * (n - 1);
    this.vel = 0;
    this.dragging = false;
    this.visible = true;
    this.lastIdx = -1;
    this.lastImage = null;
    this.interacted = false;
    this.ac = new AbortController();

    this.video = this.o.video;
    this.canvas = this.video ?? this.o.canvas ?? document.createElement('canvas');
    if (!this.video && !this.o.canvas) {
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      root.prepend(this.canvas);
    }
    this.ctx = this.video ? null : this.canvas.getContext('2d');
    if (!this.video && !this.ctx) return;
    if (this.video) {
      this.video.pause();
      this.video.muted = true;
      for (const event of ['loadedmetadata', 'loadeddata', 'seeked']) {
        this.video.addEventListener(event, () => this.#render(true), { signal: this.ac.signal });
      }
      const source = this.video.dataset.src;
      if (source) {
        // Full original bytes keep seeking available on static servers without Range support.
        fetch(source, { signal: this.ac.signal })
          .then(response => {
            if (!response.ok) throw new Error(`Video: ${response.status}`);
            return response.blob();
          })
          .then(blob => {
            if (this.ac.signal.aborted) return;
            this.videoObjectUrl = URL.createObjectURL(blob);
            this.video.src = this.videoObjectUrl;
            this.video.load();
          })
          .catch(() => {
            if (this.ac.signal.aborted) return;
            this.video.src = source;
            this.video.load();
          });
      }
    }
    root.style.touchAction = 'pan-y';      // 横向手势归我们，竖向仍可滚动页面
    root.style.userSelect = 'none';
    root.tabIndex = root.tabIndex >= 0 ? root.tabIndex : 0;

    this.#bind();
    this.#resize();
    this.#loadNear(this.requested);
    this.raf = requestAnimationFrame(this.#tick);
  }

  /* ---------- 公共 API ---------- */
  setProgress(p, { immediate = false } = {}) {
    this.vel = 0;
    this.target = this.#clamp(p * (this.o.frameCount - 1));
    if (immediate) { this.current = this.target; this.#render(true); }
  }
  get progress() { return this.current / (this.o.frameCount - 1); }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.frames.forEach(frame => frame?.close());
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    }
    this.canvas.remove();
  }

  /* ---------- 内部 ---------- */
  #clamp(v) { return Math.min(this.o.frameCount - 1, Math.max(0, v)); }

  #markInteract() {
    if (this.interacted) return;
    this.interacted = true;
    this.o.onFirstInteract?.();
  }

  #bind() {
    const { signal } = this.ac;
    const r = this.root;
    let lastX = 0, lastT = 0, pointerId = null;

    r.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      pointerId = e.pointerId;
      this.dragging = true;
      this.vel = 0;
      lastX = e.clientX; lastT = performance.now();
      r.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse') r.focus({ preventScroll: true });
      r.classList.add('is-dragging');
      this.#markInteract();
    }, { signal });

    r.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dir = this.o.invert ? -1 : 1;
      const df = (dx / r.clientWidth) * this.o.frameCount * this.o.dragSensitivity * dir;
      this.target = this.#clamp(this.target + df);
      const inst = (df / Math.max(1, now - lastT)) * 16.7;      // 帧/每 60fps 一帧
      this.vel = this.vel * 0.6 + inst * 0.4;
      lastX = e.clientX; lastT = now;
    }, { signal });

    const end = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      this.dragging = false;
      r.classList.remove('is-dragging');
      if (e.type !== 'pointerup' || performance.now() - lastT > 80) this.vel = 0;
    };
    r.addEventListener('pointerup', end, { signal });
    r.addEventListener('pointercancel', end, { signal });
    r.addEventListener('lostpointercapture', end, { signal });

    r.addEventListener('wheel', (e) => {
      if (!this.o.captureWheel || e.ctrlKey || e.metaKey) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      const max = this.o.frameCount - 1;
      if ((d > 0 && this.target >= max) || (d < 0 && this.target <= 0)) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.clientHeight : 1;
      e.preventDefault();
      this.vel = 0;
      this.target = this.#clamp(this.target + d * unit * this.o.wheelSpeed);
      this.#markInteract();
    }, { passive: false, signal });

    r.addEventListener('keydown', (e) => {
      if (e.target !== r || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = this.o.keySpeed;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.target = this.#clamp(this.target + k);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.target = this.#clamp(this.target - k);
      else return;
      this.vel = 0;
      e.preventDefault();
      this.#markInteract();
    }, { signal });

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; });
    this.intersectionObserver.observe(r);
  }

  #resize() {
    if (this.video) {
      this.#render(true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w; this.canvas.height = h;
    this.lastIdx = -1;
    this.#render(true);
  }

  #loadNear(index) {
    this.requested = index;
    if (this.video) return;
    const { signal } = this.ac;
    if (signal.aborted) return;
    const last = this.o.frameCount - 1;
    const fine = [index];
    for (let offset = 1; offset <= this.o.preloadRadius; offset++) {
      if (index + offset <= last) fine.push(index + offset);
      if (index - offset >= 0) fine.push(index - offset);
    }
    const coarse = [last];
    for (let i = 0; i < last; i += this.o.previewStep) coarse.push(i);
    // Keep an evenly spaced preview plus nearby full frames to bound decoded memory.
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i] && i !== last && i % this.o.previewStep !== 0 && Math.abs(i - index) > this.o.retentionRadius
          && this.frames[i] !== this.lastImage) {
        this.frames[i].close();
        this.frames[i] = undefined;
      }
    }
    for (const i of [...fine, ...coarse]) {
      if (this.pending.size >= this.o.concurrency) break;
      if (this.frames[i] || this.pending.has(i) || this.unavailable.has(i)) continue;
      this.pending.add(i);
      fetch(this.o.frameUrl(i), { signal })
        .then(response => {
          if (!response.ok) throw new Error(`Frame ${i + 1}: ${response.status}`);
          return response.blob();
        })
        .then(blob => createImageBitmap(blob))
        .then(image => {
          if (signal.aborted) image.close();
          else this.frames[i] = image;
        })
        .catch(() => {
          if (!signal.aborted) this.unavailable.add(i);
        })
        .finally(() => {
          this.pending.delete(i);
          if (signal.aborted) return;
          this.#render();
          this.#loadNear(this.requested);
        });
    }
  }

  #nearest(i) {
    const n = this.o.frameCount;
    for (let d = 0; d < n; d++) {
      if (this.frames[i - d]) return i - d;
      if (this.frames[i + d]) return i + d;
    }
    return null;
  }

  #render(force = false) {
    if (this.video) {
      this.#renderVideo(force);
      return;
    }
    const idx = Math.round(this.current);
    if (idx !== this.requested) this.#loadNear(idx);
    if (!this.lastImage && !this.interacted && !this.frames[this.firstIdx]
        && !this.unavailable.has(this.firstIdx)) return;
    const shown = this.#nearest(idx);
    if (shown === null) return;
    const f = this.frames[shown];
    if (!force && shown === this.lastIdx && f === this.lastImage) return;
    this.lastIdx = shown;
    this.lastImage = f;
    const { width: cw, height: ch } = this.canvas;
    const k = this.o.fit === 'cover'
      ? Math.max(cw / f.width, ch / f.height)
      : Math.min(cw / f.width, ch / f.height);
    const w = f.width * k, h = f.height * k;
    const c = this.ctx;
    if (this.o.background === 'transparent') c.clearRect(0, 0, cw, ch);
    else { c.fillStyle = this.o.background; c.fillRect(0, 0, cw, ch); }
    c.drawImage(f, (cw - w) / 2, (ch - h) / 2, w, h);
    this.o.onProgress?.(shown / (this.o.frameCount - 1), shown);
  }

  #renderVideo(force) {
    const video = this.video;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) return;
    const lastTime = Math.max(0, video.duration - 1 / this.o.frameRate);
    const index = Math.round(this.current);
    if (video.readyState >= 2) {
      const progress = lastTime > 0 ? Math.min(1, video.currentTime / lastTime) : 0;
      const shown = Math.round(progress * (this.o.frameCount - 1));
      if (force || shown !== this.lastIdx) {
        this.lastIdx = shown;
        this.o.onProgress?.(shown / (this.o.frameCount - 1), shown);
      }
    }
    const time = index / (this.o.frameCount - 1) * lastTime;
    if (Math.abs(video.currentTime - time) > .5 / this.o.frameRate) video.currentTime = time;
  }

  #tick = () => {
    this.raf = requestAnimationFrame(this.#tick);
    if (!this.visible) return;
    if (!this.dragging && Math.abs(this.vel) > 0.005 && this.o.inertia > 0) {
      this.target = this.#clamp(this.target + this.vel);
      this.vel *= this.o.inertia;
      if (this.target <= 0 || this.target >= this.o.frameCount - 1) this.vel = 0;
    }
    const diff = this.target - this.current;
    if (Math.abs(diff) > 0.001) {
      this.current += diff * this.o.smoothing;
      this.#render();
    }
  };
}
