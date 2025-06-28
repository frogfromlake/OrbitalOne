// tileLoader/debug/DebugUI.ts
export interface DebugFeature {
  key: keyof Window;
  label: string;
  type: "checkbox";
  default: boolean;
  section?: string;
}

export interface DebugUIOptions {
  features: DebugFeature[];
  containerId?: string;
  title?: string;
}

export function createDebugUI({
  features,
  containerId = "tile-debug-ui",
  title = "Tile Debug UI",
}: DebugUIOptions) {
  const windowAny = window as any;

  // Create or find container
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.style.position = "fixed";
    container.style.top = "10px";
    container.style.left = "10px";
    container.style.background = "rgba(0,0,0,0.8)";
    container.style.color = "white";
    container.style.padding = "10px";
    container.style.fontFamily = "sans-serif";
    container.style.fontSize = "12px";
    container.style.borderRadius = "8px";
    container.style.zIndex = "10000";
    document.body.appendChild(container);
  }
  container.innerHTML = "";

  // Add title
  const titleElem = document.createElement("strong");
  titleElem.textContent = title;
  container.appendChild(titleElem);
  container.appendChild(document.createElement("br"));

  // Group features by section
  const sections: Record<string, DebugFeature[]> = {};
  features.forEach((f) => {
    const section = f.section || "Core";
    if (!sections[section]) sections[section] = [];
    sections[section].push(f);
  });

  // Render feature checkboxes
  Object.entries(sections).forEach(([section, feats], sectionIdx) => {
    // Separate sections vertically, except for the first
    if (sectionIdx > 0) {
      const spacer = document.createElement("div");
      spacer.style.height = "14px";
      container.appendChild(spacer);
    }

    // Section header (only if NOT "Core")
    if (section !== "Core") {
      const sectionHeader = document.createElement("div");
      sectionHeader.textContent = section;
      sectionHeader.style.margin = "0 0 5px 0";
      sectionHeader.style.fontWeight = "bold";
      sectionHeader.style.fontSize = "13px";
      sectionHeader.style.opacity = "0.85";
      sectionHeader.style.borderTop = "1px solid #444";
      sectionHeader.style.paddingTop = "6px";
      container.appendChild(sectionHeader);
    }

    feats.forEach((feature) => {
      if (typeof windowAny[feature.key] === "undefined") {
        windowAny[feature.key] = feature.default;
      }
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.marginBottom = "4px";
      label.style.marginLeft = section !== "Core" ? "8px" : "0px"; // indent debug views

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(windowAny[feature.key]);
      input.style.marginRight = "5px";
      input.addEventListener("change", () => {
        windowAny[feature.key] = input.checked;
        console.log(`[DebugUI] ${feature.key} set to`, input.checked);
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(feature.label));
      container.appendChild(label);
    });
  });

  // --- FPS / Stats Section ---
  const statsSection = document.createElement("div");
  statsSection.style.marginTop = "10px";
  statsSection.style.padding = "8px";
  statsSection.style.background = "rgba(20,20,30,0.85)";
  statsSection.style.borderRadius = "6px";
  statsSection.style.fontFamily = "monospace";
  statsSection.style.fontSize = "11px";
  statsSection.style.opacity = "0.96";
  container.appendChild(statsSection);

  // Section header
  const statsHeader = document.createElement("div");
  statsHeader.textContent = "Stats";
  statsHeader.style.fontWeight = "bold";
  statsHeader.style.marginBottom = "5px";
  statsSection.appendChild(statsHeader);

  // Stats content (will be updated)
  const statsContent = document.createElement("div");
  statsContent.style.whiteSpace = "pre";
  statsSection.appendChild(statsContent);

  // Live stats updater (FPS, Zoom Distance, Current Z, Tile Count)
  let lastFrame = performance.now();

  function updateStatsOverlay() {
    const now = performance.now();
    const delta = now - lastFrame;
    lastFrame = now;
    const fps = 1000 / delta;

    const dtm = (window as any).dynamicTileManager;
    const camera = dtm?.camera;
    const scene = dtm?.scene;
    const currentZoom = dtm?.currentZoom;

    // Camera distance from origin (for globe)
    const zoomDistance =
      camera && camera.position ? camera.position.length().toFixed(4) : "-";

    // Count tiles: for all TileGroup_Z* in scene, sum up all children
    let tileCount = 0;
    let foundGroups = 0;
    if (scene?.children) {
      // Only groups whose name starts with "TileGroup_Z"
      const groupChildren = scene.children.filter((c: any) =>
        c.name?.startsWith("TileGroup_Z")
      );
      foundGroups = groupChildren.length;
      groupChildren.forEach((g: any) => {
        const zMatch = g.name.match(/TileGroup_Z(\d+)/);
        const z = zMatch ? parseInt(zMatch[1], 10) : undefined;
        const count = g.children?.length ?? 0;
        tileCount += count;
        if (typeof z !== "undefined") {
          // Mark the active Z with a star (⭐)
          perZ += `Z${z}${z === currentZoom ? "⭐" : ""}: ${count}  `;
        }
      });
    }

    // (Optional) Per-Z breakdown for dev debugging
    const tileLayers = dtm?.getTileLayers?.();
    let perZ = "";
    if (tileLayers) {
      perZ = ""; // reset
      for (const [z, layer] of tileLayers) {
        if (layer.group?.children) {
          // Highlight the current zoom with a star ⭐
          const star = z === currentZoom ? "⭐" : "";
          perZ += `Z${z}${star}: ${layer.group.children.length}\n`;
        }
      }
    }

    statsContent.textContent =
      `FPS: ${fps.toFixed(1)}\n` +
      `Zoom Distance: ${zoomDistance}\n` +
      (perZ ? `\n\nPer Z:\n${perZ}` : "");

    requestAnimationFrame(updateStatsOverlay);
  }

  // --- Tile Preview Section ---
  const tilePreviewSection = document.createElement("div");
  tilePreviewSection.style.marginTop = "14px";
  tilePreviewSection.style.padding = "8px";
  tilePreviewSection.style.background = "rgba(24, 40, 60, 0.95)";
  tilePreviewSection.style.borderRadius = "6px";
  tilePreviewSection.style.fontFamily = "sans-serif";
  tilePreviewSection.style.fontSize = "12px";

  const header = document.createElement("div");
  header.textContent = "Tile Preview (Z/X/Y)";
  header.style.fontWeight = "bold";
  header.style.marginBottom = "5px";
  tilePreviewSection.appendChild(header);

  // --- Input fields ---
  const zInput = document.createElement("input");
  zInput.type = "number";
  zInput.placeholder = "Z";
  zInput.style.width = "34px";
  zInput.style.marginRight = "4px";

  const xInput = document.createElement("input");
  xInput.type = "number";
  xInput.placeholder = "X";
  xInput.style.width = "54px";
  xInput.style.marginRight = "4px";

  const yInput = document.createElement("input");
  yInput.type = "number";
  yInput.placeholder = "Y";
  yInput.style.width = "54px";
  yInput.style.marginRight = "4px";

  const previewBtn = document.createElement("button");
  previewBtn.textContent = "Preview";
  previewBtn.style.marginRight = "8px";
  previewBtn.style.fontSize = "11px";
  previewBtn.style.padding = "2px 8px";
  previewBtn.style.borderRadius = "4px";
  previewBtn.style.border = "1px solid #888";
  previewBtn.style.background = "#192438";
  previewBtn.style.color = "#fff";
  previewBtn.style.cursor = "pointer";

  tilePreviewSection.appendChild(zInput);
  tilePreviewSection.appendChild(xInput);
  tilePreviewSection.appendChild(yInput);
  tilePreviewSection.appendChild(previewBtn);

  const resultDiv = document.createElement("div");
  resultDiv.style.marginTop = "10px";
  resultDiv.style.display = "flex";
  resultDiv.style.alignItems = "center";
  resultDiv.style.gap = "10px";
  tilePreviewSection.appendChild(resultDiv);

  container.appendChild(tilePreviewSection);

  // --- Logic for preview ---
  previewBtn.onclick = async () => {
    const z = parseInt(zInput.value, 10);
    const x = parseInt(xInput.value, 10);
    const y = parseInt(yInput.value, 10);
    resultDiv.innerHTML = ""; // Clear old

    if (Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
      resultDiv.textContent = "Please enter valid Z/X/Y.";
      return;
    }

    // Show image only (no verdict)
    const url = ((window as any).tileUrlTemplate || "")
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const img = document.createElement("img");
    img.src = url;
    img.alt = `Sentinel-2 ${z}/${x}/${y}`;
    img.style.width = "128px";
    img.style.height = "128px";
    img.style.objectFit = "contain";
    img.style.background = "#222";
    img.style.border = "1px solid #444";
    img.onerror = () => {
      img.src = "";
      img.alt = "Tile not found";
      resultDiv.textContent = "Tile not found";
    };
    resultDiv.appendChild(img);
  };

  updateStatsOverlay();
}
