(() => {
  const filters = [...document.querySelectorAll(".catalog-filters button")];
  const heading = document.querySelector("#works-title");
  const list = document.querySelector("#project-list");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const request = new URLSearchParams(location.search).get("category");

  function galleryStrip(project) {
    const media = document.createElement("div");
    media.className = "catalog-media";
    media.setAttribute("aria-hidden", "true");
    const orderedItems = project.gallery ? project.gallery.flatMap(group => group.indices.map(index => project.items[index])) : project.items;
    const items = orderedItems.filter(item => item.kind !== "document").slice(0, 3);
    if (!items.length) return media;
    for (let index = 0; index < 3; index++) {
      const item = items[index % items.length];
      const frame = document.createElement("div");
      frame.className = "catalog-shot";
      const stills = item.previewPosters || (item.poster ? [item.poster] : []);
      const poster = item.kind === "video" && stills.length ? stills[index % stills.length] : null;
      const content = poster ? new Image() : workMedia(item, "", true);
      if (poster) { content.src = poster; content.alt = ""; content.loading = "lazy"; content.decoding = "async"; }
      else if (item.kind === "image") content.loading = "lazy";
      else {
        content.autoplay = false;
        content.addEventListener("loadedmetadata", () => {
          if (Number.isFinite(content.duration)) content.currentTime = content.duration * (.15 + index * .3);
        }, { once: true });
      }
      frame.append(content);
      media.append(frame);
    }
    return media;
  }

  function filmTile(project) {
    const item = project.items.find(item => item.kind === "video");
    const tile = document.createElement("li");
    tile.className = "film-tile";
    const frame = document.createElement("div");
    frame.className = "film-window";
    const video = workMedia(item, project.title);
    video.preload = "none";
    video.addEventListener("play", () => {
      list.querySelectorAll("video").forEach(other => { if (other !== video) other.pause(); });
    });
    frame.append(video);
    const caption = document.createElement("a");
    caption.className = "film-caption";
    caption.href = projectUrl(project);
    const title = document.createElement("h3");
    title.textContent = project.title;
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    caption.append(title, arrow);
    tile.append(frame, caption);
    return tile;
  }

  function projectRow(project) {
    if (project.category === "film") return filmTile(project);
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.className = "catalog-row";
    link.href = projectUrl(project);

    const meta = document.createElement("div");
    meta.className = "catalog-meta";
    const label = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = project.title;
    const count = document.createElement("p");
    count.textContent = `${project.categoryLabel || categoryNames[project.category]} / ${project.items.length} 件`;
    label.append(title, count);
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    meta.append(label, arrow);

    const strip = galleryStrip(project);
    link.append(meta, strip);
    row.append(link);
    const videos = [...strip.querySelectorAll("video")];
    if (videos.length) {
      const play = () => {
        if (!motion.matches) videos.forEach(video => video.play().catch(() => {}));
      };
      const pause = () => videos.forEach(video => video.pause());
      link.addEventListener("pointerenter", play);
      link.addEventListener("focus", play);
      link.addEventListener("pointerleave", pause);
      link.addEventListener("blur", pause);
    }
    const film = project.items.find(item => item.kind === "video" && item.poster);
    if (film) {
      let preview;
      const play = () => {
        if (motion.matches) return;
        if (!preview) {
          preview = workMedia(film, "", true);
          preview.autoplay = false;
          preview.className = "catalog-video-preview";
          strip.querySelector(".catalog-shot").append(preview);
        }
        preview.hidden = false;
        preview.play().catch(() => {});
      };
      const pause = () => { if (preview) { preview.pause(); preview.hidden = true; } };
      link.addEventListener("pointerenter", play);
      link.addEventListener("focus", play);
      link.addEventListener("pointerleave", pause);
      link.addEventListener("blur", pause);
    }
    return row;
  }

  function select(category, updateLocation = false) {
    const selected = filters.find(button => button.dataset.category === category);
    filters.forEach(button => button.setAttribute("aria-pressed", String(button === selected)));
    heading.textContent = category === "all" ? "作品索引" : categoryNames[category];
    document.title = `${heading.textContent} · 异族仙灵`;
    const visible = category === "all" ? projects : projects.filter(project => project.category === category);
    list.querySelectorAll("video").forEach(video => video.pause());
    list.classList.toggle("catalog-list--film", category === "film");
    list.classList.toggle("catalog-list--mixed", category === "all");
    list.replaceChildren(...visible.map(projectRow));
    if (updateLocation) {
      const url = new URL(location.href);
      if (category === "all") url.searchParams.delete("category");
      else url.searchParams.set("category", category);
      history.replaceState(history.state, "", url);
    }
  }

  for (const button of filters) {
    button.addEventListener("click", () => select(button.dataset.category, true));
  }
  const category = request === "artists" ? "commercial" : request;
  select(Object.hasOwn(categoryNames, category) ? category : "all");
})();

