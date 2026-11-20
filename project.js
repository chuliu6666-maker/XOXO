(() => {
  const id = new URLSearchParams(location.search).get("id");
  const aliases = { otherkin: "experiments", "lil-ghost": "artist-visuals" };
  const project = projects.find(work => work.id === (aliases[id] || id));
  const title = document.querySelector("#project-title");
  if (!project) {
    title.textContent = "找不到项目";
    document.querySelector("#project-missing").hidden = false;
    return;
  }

  const story = project.story;
  document.body.classList.toggle("case-page--commercial", project.category === "commercial");
  document.body.classList.toggle("case-page--story", Boolean(story));
  document.title = `${story?.title || project.title} · 异族仙灵`;
  title.textContent = story?.title || project.title;
  const subtitle = document.querySelector("#project-category");
  subtitle.textContent = story?.titleEn || project.subtitle || categoryNames[project.category];
  if (story?.titleEn) subtitle.lang = "en";
  document.querySelector("#return-works").href = `works.html?category=${project.category}`;
  const formats = { image: "图像", video: "影像", document: "项目文档" };
  const units = { image: "张", video: "段", document: "份" };
  const counts = project.items.reduce((total, item) => {
    total[item.kind] = (total[item.kind] || 0) + 1;
    return total;
  }, {});
  const mediaSummary = Object.entries(counts)
    .map(([kind, count]) => `${count} ${units[kind] || "件"}${formats[kind] || "作品"}`)
    .join("、");
  const facts = [
    ["客户", project.client],
    ["项目", project.title],
    ["类别", project.hideCategoryFact ? null : (project.categoryLabel || categoryNames[project.category])],
    ["角色", project.role],
    ["职责", project.responsibilities],
    ["成果", project.deliverables],
    ["作品形式", mediaSummary],
  ];
  const overview = document.querySelector("#project-overview");
  if (story) renderStory(story, overview);
  else {
    const factList = document.querySelector("#project-facts");
    for (const [label, value] of facts) {
      if (!value || (Array.isArray(value) && value.length === 0)) continue;
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = Array.isArray(value) ? value.join(" · ") : value;
      group.append(term, detail);
      factList.append(group);
    }
    const description = project.description || `《${project.title}》收录 ${mediaSummary}。`;
    const paragraphs = Array.isArray(description) ? description : description.split(/\n\s*\n/);
    const descriptionBox = document.querySelector("#project-description");
    for (const text of paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      descriptionBox.append(paragraph);
    }
  }
  overview.hidden = false;

  function renderStory(content, container) {
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    container.classList.add("case-overview--story");
    const intro = node("div", "case-story-intro");
    const hasLead = Boolean(content.lead?.zh || content.lead?.en);
    if (!hasLead) intro.classList.add("case-story-intro--metadata");
    const aside = node("aside", "case-story-aside");
    const metadata = node("dl", "case-story-meta");
    metadata.dataset.count = String(content.metadata?.length || 0);
    for (const { label, value } of content.metadata || []) {
      const field = node("div");
      field.append(node("dt", "", label), node("dd", "", value));
      metadata.append(field);
    }
    aside.append(metadata);
    if (content.metaLineEn) {
      const english = node("p", "case-story-meta-en", content.metaLineEn);
      english.lang = "en";
      aside.append(english);
    }
    intro.append(aside);
    if (hasLead) {
      const lead = node("div", "case-story-lead");
      if (content.lead.zh) lead.append(node("p", "case-story-lead-zh", content.lead.zh));
      if (content.lead.en) {
        const english = node("p", "case-story-lead-en", content.lead.en);
        english.lang = "en";
        lead.append(english);
      }
      intro.append(lead);
    }
    const sections = [intro];
    const backgroundText = content.background?.text;
    const paragraphs = (Array.isArray(backgroundText) ? backgroundText : [backgroundText])
      .flatMap(text => typeof text === "string" ? text.split(/\n+/) : [])
      .map(text => text.trim())
      .filter(Boolean);
    if (paragraphs.length) {
      const background = node("section", "case-story-section");
      const copy = node("div", "case-story-background");
      for (const text of paragraphs) copy.append(node("p", "", text));
      if (content.background.heading) background.append(node("h2", "", content.background.heading));
      background.append(copy);
      sections.push(background);
    }
    const strategyItems = content.strategy?.items || [];
    if (strategyItems.length) {
      const strategy = node("section", "case-story-section");
      const strategies = node("ol", "case-story-strategies");
      strategyItems.forEach((item, index) => {
        const entry = node("li");
        const number = node("span", "case-story-strategy-number", String(index + 1).padStart(2, "0"));
        number.setAttribute("aria-hidden", "true");
        const copy = node("div");
        copy.append(node("h3", "", item.title), node("p", "", item.text));
        entry.append(number, copy);
        strategies.append(entry);
      });
      if (content.strategy.heading) strategy.append(node("h2", "", content.strategy.heading));
      strategy.append(strategies);
      sections.push(strategy);
    }
    container.replaceChildren(...sections);
  }
  const gallery = document.querySelector("#project-gallery");
  if (project.id === "cosmo") gallery.classList.add("case-gallery--daily");
  const viewer = document.querySelector("#project-viewer");
  const stage = document.querySelector("#project-stage");
  const counter = document.querySelector("#project-counter");
  const previous = document.querySelector("#previous");
  const next = document.querySelector("#next");
  const nextProject = document.querySelector("#next-project");
  const siblings = projects.filter(work => work.category === project.category);
  const adjacent = siblings[(siblings.indexOf(project) + 1) % siblings.length];
  nextProject.href = projectUrl(adjacent);
  nextProject.querySelector("strong").textContent = adjacent.title;
  nextProject.hidden = siblings.length < 2;
  let selected = 0;
  let viewingOrder = project.items.map((_, index) => index);

  function show(position) {
    if (position < 0 || position >= project.items.length) return;
    selected = position;
    const item = project.items[viewingOrder[position]];
    stage.replaceChildren(workMedia(item, item.alt || `${project.title} · 素材 ${position + 1}`));
    stage.classList.toggle("viewer-media--scroll", item.kind === "image" && item.height / item.width > 2.6);
    stage.scrollTop = 0;
    counter.textContent = `${position + 1} / ${project.items.length}`;
    previous.disabled = position === 0;
    next.disabled = position === project.items.length - 1;
  }

  function imageTile(item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "case-piece";
    button.setAttribute("aria-label", `放大查看作品 ${index + 1}`);
    const image = workMedia(item, item.alt || `${project.title} · 作品 ${index + 1}`);
    if (index > 1) image.loading = "lazy";
    button.append(image);
    button.addEventListener("click", () => {
      show(viewingOrder.indexOf(index));
      viewer.showModal();
    });
    return button;
  }

  const pieces = project.items.map((item, index) => {
    if (item.kind === "image") {
      return imageTile(item, index);
    }
    const media = workMedia(item, project.title);
    if (item.kind === "document") {
      media.className = "case-piece case-piece--wide case-piece--pdf";
      return media;
    }
    media.preload = "metadata";
    const tile = document.createElement("div");
    tile.className = "case-piece case-piece--wide";
    tile.append(media);
    return tile;
  });
  // Group matching artwork variants together, using their original item indices.
  const seriesOrder = {
    experiments: [[0], [1, 2, 3, 4], [5], [6]],
    "cosmo-anniversary": [[0, 1, 2], [3]],
    cosmo: [[0], [1, 2], [3, 4, 5], [6], [7], [8, 9], [10], [11], [12, 13], [14], [15]],
    "artist-visuals": [[0], [1], [2], [3], [4, 6], [5]],
  };
  const groups = project.gallery || (seriesOrder[project.id] || [pieces.map((_, index) => index)])
    .map(indices => ({ indices }));
  viewingOrder = groups.flatMap(group => group.indices);
  groups.forEach(({ indices, layout, label, eyebrow, rule }) => {
    const series = document.createElement(label ? "section" : "div");
    series.className = "case-series";
    if (layout) series.classList.add(`case-series--${layout}`);
    series.dataset.count = String(indices.length);
    if (label) {
      const heading = document.createElement("h2");
      heading.className = "case-series-label";
      const number = document.createElement("span");
      const name = document.createElement("span");
      number.textContent = eyebrow || "";
      name.textContent = label;
      heading.append(number, name);
      series.append(heading);
    } else if (rule) {
      const separator = document.createElement("div");
      separator.className = "case-series-rule";
      separator.setAttribute("aria-hidden", "true");
      series.append(separator);
    }
    indices.forEach(index => series.append(pieces[index]));
    gallery.append(series);
  });
  viewingOrder.forEach((index, position) => {
    if (pieces[index] instanceof HTMLButtonElement) {
      pieces[index].setAttribute("aria-label", `放大查看作品 ${position + 1}`);
    }
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!reduced.matches && "IntersectionObserver" in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("is-entering");
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px 40px 0px", threshold: 0 });
    gallery.querySelectorAll(".case-piece").forEach(piece => {
      piece.classList.add("is-entering");
      reveal.observe(piece);
    });
  }

  previous.addEventListener("click", () => show(selected - 1));
  next.addEventListener("click", () => show(selected + 1));
  viewer.addEventListener("keydown", event => {
    if (event.target instanceof HTMLVideoElement) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    show(selected + (event.key === "ArrowLeft" ? -1 : 1));
  });
  viewer.addEventListener("close", () => stage.replaceChildren());
})();

