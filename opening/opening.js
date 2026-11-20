(() => {
  const sequence = document.querySelector("#opening-sequence");
  const track = sequence.querySelector(".opening-scroll-track");
  const opening = document.querySelector("#opening");
  const mode = document.querySelector("#scroll-mode");
  const hint = document.querySelector("#scroll-hint");
  const take = document.querySelector("#take");
  const reel = document.querySelector("#reel");
  const time = document.querySelector("#reel-time");
  const entry = document.querySelector("#entry");
  const skipLink = document.querySelector("[data-enter]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 4000;
  const footage = [
    [".shot--look", [
      { offset: 0, opacity: 1, transform: "translate(5%, -8%) scale(1.24) rotate(4deg)" },
      { offset: .22, opacity: 1, transform: "translate(1%, -3%) scale(1.04) rotate(0deg)" },
      { offset: .41, opacity: 0, transform: "translate(-4%, 5%) scale(.94) rotate(-3deg)" },
      { offset: 1, opacity: 0 },
    ]],
    [".lift", [
      { offset: 0, opacity: 0 },
      { offset: .075, opacity: 0 },
      { offset: .25, opacity: 1 },
      { offset: 1, opacity: 1 },
    ]],
    [".shot--hold", [
      { offset: 0, opacity: 0, transform: "translate(2%, -2%) scale(1.06) rotate(3deg)" },
      { offset: .23, opacity: 0, transform: "translate(2%, -2%) scale(1.06) rotate(3deg)" },
      { offset: .42, opacity: 1, transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { offset: .57, opacity: 1, transform: "translate(0, 1%) scale(.98) rotate(-1deg)" },
      { offset: .75, opacity: 0, transform: "translate(0, 0) scale(.98) rotate(0deg)" },
      { offset: 1, opacity: 0 },
    ]],
    [".shot--offer", [
      { offset: 0, opacity: 0, transform: "translate(0, 1%) scale(.94)" },
      { offset: .58, opacity: 0, transform: "translate(0, 1%) scale(.94)" },
      { offset: .75, opacity: 1, transform: "translate(1%, 1%) scale(.95)", easing: "cubic-bezier(.2,.75,.28,1)" },
      { offset: .93, opacity: 1, transform: "translate(-.4%, -.2%) scale(1.01)", easing: "ease-out" },
      { offset: 1, opacity: 1, transform: "none" },
    ]],
  ];
  const shots = footage.map(([selector, frames]) => {
    const animation = document.querySelector(selector).animate(frames, { duration, fill: "both" });
    animation.pause();
    return animation;
  });
  let frame = 0;
  let playStart = 0;
  let pull = null;
  let suppressClick = false;
  let entering = false;
  let userSetTimeline = false;
  let position = 0;
  let scrollDriven = false;
  let scrubFrame = 0;
  let scrubTarget = 0;
  let scrubTime = 0;

  function seek(milliseconds) {
    position = Math.max(0, Math.min(duration, milliseconds));
    for (const shot of shots) shot.currentTime = position;
    const state = position === duration ? "ready" : "playing";
    if (opening.dataset.state !== state) opening.dataset.state = state;
    if (take.disabled !== (state !== "ready")) take.disabled = state !== "ready";
    reel.value = String(position);
    const seconds = Math.floor(position / 1000);
    time.textContent = `00:0${seconds}`;
    reel.setAttribute("aria-valuetext", `${(position / 1000).toFixed(1)} 秒，共 4 秒`);
  }

  function tick(now) {
    const elapsed = now - playStart;
    seek(elapsed);
    frame = elapsed < duration ? requestAnimationFrame(tick) : 0;
  }

  function play() {
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      seek(duration);
      return;
    }
    seek(0);
    playStart = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stopScrubbing() {
    cancelAnimationFrame(scrubFrame);
    scrubFrame = 0;
  }

  function setScrollMode(enabled) {
    stopScrubbing();
    scrollDriven = enabled;
    sequence.classList.toggle("is-scroll-driven", enabled);
    mode.setAttribute("aria-pressed", String(enabled));
    hint.hidden = !enabled;
  }

  function scrub(now) {
    const elapsed = now - scrubTime;
    scrubTime = now;
    const remaining = scrubTarget - position;
    if (Math.abs(remaining) < 8) {
      seek(scrubTarget);
      scrubFrame = 0;
      return;
    }
    seek(position + remaining * (1 - Math.exp(-elapsed / 65)));
    scrubFrame = requestAnimationFrame(scrub);
  }

  function syncScroll() {
    if (!scrollDriven || entering) return;
    const offset = -sequence.getBoundingClientRect().top;
    const distance = Math.max(1, track.offsetHeight);
    scrubTarget = offset >= distance - 1 ? duration : Math.max(0, offset / distance) * duration;
    if (reducedMotion.matches) {
      seek(scrubTarget);
    } else if (!scrubFrame && scrubTarget !== position) {
      scrubTime = performance.now();
      scrubFrame = requestAnimationFrame(scrub);
    }
  }

  function replay() {
    if (entering) return;
    userSetTimeline = true;
    if (scrollDriven) {
      setScrollMode(false);
      sequence.scrollIntoView({ behavior: "instant" });
    }
    play();
  }

  function enterWorks(skip = false) {
    if (entering) return;
    entering = true;
    userSetTimeline = true;
    cancelAnimationFrame(frame);
    stopScrubbing();
    seek(duration);

    const land = () => {
      if (scrollDriven) setScrollMode(false);
      location.assign(skipLink.href);
    };

    if (skip || reducedMotion.matches) {
      land();
      entering = false;
      return;
    }

    entry.hidden = false;
    entry.querySelector(".entry-image").addEventListener("animationend", () => {
      land();
      entry.classList.add("is-leaving");
    }, { once: true });
  }
  entry.addEventListener("animationend", event => {
    if (event.target !== entry || event.animationName !== "entry-leave") return;
    entry.hidden = true;
    entry.classList.remove("is-leaving");
    entering = false;
  });

  take.addEventListener("pointerdown", event => {
    if (take.disabled || entering || !event.isPrimary || event.button !== 0 || pull) return;
    suppressClick = false;
    pull = { id: event.pointerId, y: event.clientY, x: event.clientX, moved: false };
    take.setPointerCapture(event.pointerId);
    opening.classList.add("is-pulling");
  });
  take.addEventListener("pointermove", event => {
    if (pull?.id !== event.pointerId) return;
    const distance = event.clientY - pull.y;
    pull.moved ||= Math.hypot(event.clientX - pull.x, distance) > 8;
    const offset = Math.max(0, Math.min(100, distance));
    opening.style.setProperty("--pull", `${offset}px`);
    opening.style.setProperty("--pull-angle", `${offset * .021}deg`);
  });
  function release(event) {
    if (pull?.id !== event.pointerId) return;
    const taken = event.type === "pointerup" && event.clientY - pull.y > 43;
    suppressClick = pull.moved || taken;
    pull = null;
    opening.classList.remove("is-pulling");
    opening.style.removeProperty("--pull");
    opening.style.removeProperty("--pull-angle");
    if (taken && !take.disabled) enterWorks();
  }
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) take.addEventListener(event, release);
  take.addEventListener("click", event => {
    if (!take.disabled && (!suppressClick || event.detail === 0)) enterWorks();
  });
  skipLink.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enterWorks(true);
  });
  document.querySelector("#replay").addEventListener("click", replay);
  mode.addEventListener("click", () => {
    if (entering) return;
    if (scrollDriven) {
      replay();
      return;
    }
    userSetTimeline = true;
    cancelAnimationFrame(frame);
    setScrollMode(true);
    sequence.scrollIntoView({ behavior: "instant" });
    scrubTarget = 0;
    seek(0);
  });
  window.addEventListener("scroll", syncScroll, { passive: true });
  window.addEventListener("resize", syncScroll);
  reel.addEventListener("input", () => {
    if (entering) return;
    userSetTimeline = true;
    cancelAnimationFrame(frame);
    stopScrubbing();
    const target = reel.valueAsNumber;
    seek(target);
    if (scrollDriven) {
      const sequenceTop = window.scrollY + sequence.getBoundingClientRect().top;
      scrubTarget = target;
      window.scrollTo({ top: sequenceTop + track.offsetHeight * target / duration, behavior: "instant" });
    }
  });
  reducedMotion.addEventListener("change", () => {
    if (entering) return;
    userSetTimeline = true;
    cancelAnimationFrame(frame);
    stopScrubbing();
    if (scrollDriven) syncScroll();
    else seek(duration);
  });

  if (location.hash || reducedMotion.matches) {
    seek(duration);
  } else {
    seek(0);
    Promise.allSettled([...opening.querySelectorAll(".shot img")].map(image => image.decode()))
      .then(() => {
        if (!userSetTimeline) play();
      });
  }
})();
