const clamp = value => Math.min(1, Math.max(0, value));

// Gestures extend a continuous video segment; they never seek on every frame.
export class HeroVideoMotion {
  constructor(root, options) {
    this.root = root;
    this.o = { frameRate: 30, frameCount: 300, minBurst: .85, ...options };
    this.forward = options.video;
    this.reverse = options.reverseVideo;
    this.active = this.forward;
    this.direction = 1;
    this.goal = 0;
    this.running = false;
    this.visible = true;
    this.lastInput = 0;
    this.ac = new AbortController();
    this.urls = [];
    root.tabIndex = 0;
    root.style.touchAction = 'pan-y';
    root.style.userSelect = 'none';
    for (const video of [this.forward, this.reverse]) this.#load(video);
    this.#bind();
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (!this.visible) this.active.pause();
    });
    this.observer.observe(root);
    this.raf = requestAnimationFrame(this.#tick);
  }

  #end(video) {
    return Math.max(0, Math.min(video.duration, (this.o.frameCount - 1) / this.o.frameRate));
  }

  #progress(video = this.active) {
    const end = this.#end(video);
    if (!Number.isFinite(end) || end <= 0) return 0;
    const p = clamp(video.currentTime / end);
    return video === this.reverse ? 1 - p : p;
  }

  #time(video, p) {
    return (video === this.reverse ? 1 - p : p) * this.#end(video);
  }

  #load(video) {
    video.pause();
    video.muted = true;
    video.addEventListener('loadeddata', () => {
      if (video === this.active) this.#publish();
    }, { signal: this.ac.signal });
    const source = video.dataset.src;
    fetch(source, { signal: this.ac.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Video: ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (this.ac.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        video.src = url;
        video.load();
      })
      .catch(() => {
        if (this.ac.signal.aborted) return;
        video.src = source;
        video.load();
      });
  }

  #publish() {
    if (this.active.readyState < 2 || this.active.seeking) return;
    const p = this.#progress();
    const frame = Math.round(p * (this.o.frameCount - 1));
    this.o.onProgress?.(p, frame);
  }

  #nudge(delta) {
    if (!delta) return;
    const direction = Math.sign(delta);
    const now = performance.now();
    const p = this.#progress();
    const continues = this.running && direction === this.direction && now - this.lastInput < 240;
    const minimum = this.o.minBurst / (this.o.frameCount / this.o.frameRate);
    this.goal = continues ? clamp(this.goal + delta)
      : clamp(p + direction * Math.max(Math.abs(delta), minimum));
    if (direction !== this.direction) this.pending = null;
    this.direction = direction;
    this.lastInput = now;
    this.running = true;
    if (this.o.smoothing === 1) this.setProgress(clamp(p + delta), { immediate: true });
  }

  #bind() {
    const { signal } = this.ac;
    let pointer = null;
    let lastX = 0;
    this.root.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      this.root.setPointerCapture(pointer);
      this.root.classList.add('is-dragging');
      if (event.pointerType === 'mouse') this.root.focus({ preventScroll: true });
    }, { signal });
    this.root.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const delta = (event.clientX - lastX) / this.root.clientWidth * this.o.dragSensitivity;
      lastX = event.clientX;
      this.#nudge(delta);
    }, { signal });
    const endDrag = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.root.classList.remove('is-dragging');
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.root.addEventListener(event, endDrag, { signal });
    }
    this.root.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      const p = this.#progress();
      if ((delta < 0 && p <= .001 && !this.running) || (delta > 0 && p >= .999 && !this.running)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.root.clientHeight : 1;
      this.#nudge(delta * unit * this.o.wheelSpeed / (this.o.frameCount - 1));
    }, { passive: false, signal });
    this.root.addEventListener('keydown', event => {
      if (event.target !== this.root || event.ctrlKey || event.metaKey || event.altKey) return;
      const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      this.#nudge(direction * 4 / (this.o.frameCount - 1));
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.active.pause();
    }, { signal });
  }

  #drive() {
    this.#publish();
    if (!this.running) return;
    const p = this.#progress();
    if (this.direction * (this.goal - p) <= .0018) {
      this.active.pause();
      this.active.playbackRate = 1;
      if ((this.goal === 0 || this.goal === 1) && Math.abs(this.goal - p) > .000001) {
        this.active.currentTime = this.#time(this.active, this.goal);
      } else this.goal = p;
      this.running = false;
      this.pending = null;
      return;
    }
    const next = this.direction > 0 ? this.forward : this.reverse;
    if (next !== this.active) {
      this.active.pause();
      if (next.readyState < 1) return;
      if (this.pending !== next) {
        this.pending = next;
        next.currentTime = this.#time(next, p);
        return;
      }
      if (next.seeking || next.readyState < 2) return;
      this.active.classList.add('is-dormant');
      next.classList.remove('is-dormant');
      this.active = next;
      this.pending = null;
    }
    if (this.active.seeking || this.active.readyState < 2) return;
    const remaining = Math.abs(this.goal - this.#progress()) * this.#end(this.active);
    this.active.playbackRate = .55 + .45 * Math.min(1, remaining / .22);
    if (this.active.paused && !this.playPending) {
      const playing = this.active;
      this.playPending = playing;
      playing.play().catch(() => {}).finally(() => {
        if (this.playPending === playing) this.playPending = null;
        if (playing !== this.active) playing.pause();
      });
    }
  }

  #tick = () => {
    this.raf = requestAnimationFrame(this.#tick);
    if (!this.visible || document.hidden) return;
    this.#drive();
  };

  get progress() { return this.#progress(); }

  setProgress(p, { immediate = false } = {}) {
    p = clamp(p);
    this.pending = null;
    this.lastInput = 0;
    this.direction = p >= this.progress ? 1 : -1;
    this.goal = p;
    this.running = !immediate;
    if (immediate && this.active.readyState >= 1) {
      this.active.pause();
      this.active.currentTime = this.#time(this.active, p);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.observer.disconnect();
    for (const video of [this.forward, this.reverse]) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    this.urls.forEach(url => URL.revokeObjectURL(url));
  }
}
