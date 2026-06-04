const DAILY_POINTS = 4000;
const GENERATION_COST = 5;
const STORAGE_KEY = "babyBlueAiStudioStateV1";

const presets = [
  { id: "character-sheet", name: "Character Sheet", text: "Create a clean character sheet with front view, side view, back view, and small expression/mouth studies. Keep the same character identity from the references. Plain white background. Full body visible." },
  { id: "tpose-front", name: "3D T-Pose Front", text: "Create a full-body 3D character model render in a strict T-pose, FRONT VIEW ONLY, plain white background, zoomed out so the entire body is visible head to toe." },
  { id: "tpose-back", name: "3D T-Pose Back", text: "Create a full-body 3D character model render in a strict T-pose, BACK VIEW ONLY, plain white background, zoomed out head to toe. Hands must face correctly for a back view with pinky side visible, not thumbs." },
  { id: "tpose-side", name: "3D T-Pose Side", text: "Create a full-body 3D character model render in a strict T-pose, SIDE VIEW ONLY, plain white background, zoomed out head to toe." },
  { id: "plain-bg", name: "Plain Background", text: "Use a clean plain white or light neutral background with no effects, no props, no text, and no scenery unless requested." },
  { id: "green-screen", name: "Green Screen", text: "Use a flat solid chroma key green screen background only. No shadows or background objects." },
  { id: "full-body", name: "Full Body Zoomed Out", text: "Frame the image zoomed out so the full body is visible from head to toe with no cropping." },
  { id: "arcane-3d", name: "Arcane-like 3D", text: "Render as a painterly stylized 3D animated character model with dramatic hand-painted textures, cinematic sculpted forms, and high-quality 3D render lighting. Keep it as an original design." },
  { id: "low-poly", name: "Low-Poly PS2", text: "Render as a retro PS1/PS2 low-poly 3D game model with simple geometry, visible polygon edges, readable textures, and plain background." },
  { id: "pose-transfer", name: "Use Pose Ref", text: "Use the reference image for pose and camera angle while preserving the main character's identity, outfit, proportions, and art style from the character reference." }
];

const els = {
  form: document.getElementById("generateForm"),
  prompt: document.getElementById("prompt"),
  presetGrid: document.getElementById("presetGrid"),
  size: document.getElementById("size"),
  quality: document.getElementById("quality"),
  refs: document.getElementById("refs"),
  refPreview: document.getElementById("refPreview"),
  generateBtn: document.getElementById("generateBtn"),
  clearBtn: document.getElementById("clearBtn"),
  pointsText: document.getElementById("pointsText"),
  estimateText: document.getElementById("estimateText"),
  imageStage: document.getElementById("imageStage"),
  statusTitle: document.getElementById("statusTitle"),
  statusPill: document.getElementById("statusPill"),
  likeBtn: document.getElementById("likeBtn"),
  dislikeBtn: document.getElementById("dislikeBtn"),
  redoBtn: document.getElementById("redoBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  gallery: document.getElementById("gallery"),
  clearGalleryBtn: document.getElementById("clearGalleryBtn")
};

let state = loadState();
let activePresets = new Set();
let currentImage = null;
let lastPayload = null;

function todayKey() { return new Date().toLocaleDateString("en-CA"); }

function loadState() {
  const fallback = { date: todayKey(), points: DAILY_POINTS, gallery: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.date !== todayKey()) return fallback;
    return { ...fallback, ...saved };
  } catch { return fallback; }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function updatePoints() {
  els.pointsText.textContent = `${state.points} / ${DAILY_POINTS}`;
  els.estimateText.textContent = `About ${Math.floor(state.points / GENERATION_COST)} generations left at ${GENERATION_COST} points each`;
  els.generateBtn.disabled = state.points < GENERATION_COST;
}

function renderPresets() {
  els.presetGrid.innerHTML = "";
  presets.forEach(preset => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset";
    btn.textContent = preset.name;
    btn.onclick = () => {
      activePresets.has(preset.id) ? activePresets.delete(preset.id) : activePresets.add(preset.id);
      btn.classList.toggle("active");
    };
    els.presetGrid.appendChild(btn);
  });
}

function buildPrompt() {
  const presetText = presets.filter(p => activePresets.has(p.id)).map(p => `- ${p.text}`).join("\n");
  const userText = els.prompt.value.trim();
  return `You are generating an image for a private personal image studio. Follow the user's request and reference images carefully.\n\nSelected presets:\n${presetText || "- No preset selected."}\n\nUser prompt:\n${userText}\n\nGeneral rules:\n- Preserve the reference character's identity when references are provided.\n- Keep the result clean and usable as concept art or model reference.\n- Avoid text, watermarks, logos, and random extra characters unless requested.\n- If a request asks for an exact copyrighted character, create an original inspired alternative instead.`;
}

async function filesToDataUrls(fileList) {
  const files = [...fileList].slice(0, 6);
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
}

function spendPoints() {
  if (state.points < GENERATION_COST) throw new Error("Not enough points left today.");
  state.points -= GENERATION_COST;
  saveState(); updatePoints();
}
function refundPoints() {
  state.points = Math.min(DAILY_POINTS, state.points + GENERATION_COST);
  saveState(); updatePoints();
}

function setBusy(isBusy) {
  els.generateBtn.disabled = isBusy || state.points < GENERATION_COST;
  els.statusPill.textContent = isBusy ? "Generating" : "Idle";
  els.statusTitle.textContent = isBusy ? "Generating..." : "Ready";
}

function setCurrentImage(dataUrl) {
  currentImage = dataUrl;
  els.imageStage.innerHTML = `<img alt="Generated output" src="${dataUrl}">`;
  els.likeBtn.disabled = false;
  els.dislikeBtn.disabled = false;
  els.redoBtn.disabled = false;
  els.downloadBtn.href = dataUrl;
  els.downloadBtn.classList.add("hidden");
  els.statusTitle.textContent = "Review image";
  els.statusPill.textContent = "Unsaved";
}

async function generate(payload, shouldSpend = true) {
  if (shouldSpend) spendPoints();
  setBusy(true);
  els.imageStage.innerHTML = `<p>Generating image...</p>`;
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed.");
    const dataUrl = `data:image/png;base64,${data.imageBase64}`;
    setCurrentImage(dataUrl);
  } catch (err) {
    if (shouldSpend) refundPoints();
    els.imageStage.innerHTML = `<p>${err.message}</p>`;
    els.statusTitle.textContent = "Error";
    els.statusPill.textContent = "Refunded";
  } finally {
    setBusy(false);
  }
}

function renderGallery() {
  els.gallery.innerHTML = "";
  if (!state.gallery.length) {
    els.gallery.innerHTML = `<p class="note">No saved images yet.</p>`;
    return;
  }
  state.gallery.forEach(src => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Saved generated image";
    els.gallery.appendChild(img);
  });
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = buildPrompt();
  const referenceImages = await filesToDataUrls(els.refs.files);
  lastPayload = { prompt, referenceImages, size: els.size.value, quality: els.quality.value };
  await generate(lastPayload, true);
});

els.refs.addEventListener("change", async () => {
  const urls = await filesToDataUrls(els.refs.files);
  els.refPreview.innerHTML = urls.map(url => `<img src="${url}" alt="reference preview">`).join("");
});

els.likeBtn.onclick = () => {
  if (!currentImage) return;
  state.gallery.unshift(currentImage);
  state.gallery = state.gallery.slice(0, 24);
  saveState(); renderGallery();
  els.statusTitle.textContent = "Saved";
  els.statusPill.textContent = "Liked";
  els.downloadBtn.classList.remove("hidden");
};

els.dislikeBtn.onclick = () => {
  if (!currentImage) return;
  currentImage = null;
  refundPoints();
  els.imageStage.innerHTML = `<p>Image deleted. Points refunded.</p>`;
  els.likeBtn.disabled = true;
  els.dislikeBtn.disabled = true;
  els.redoBtn.disabled = !lastPayload;
  els.downloadBtn.classList.add("hidden");
  els.statusTitle.textContent = "Deleted";
  els.statusPill.textContent = "Refunded";
};

els.redoBtn.onclick = async () => {
  if (!lastPayload) return;
  currentImage = null;
  await generate(lastPayload, true);
};

els.clearBtn.onclick = () => {
  els.prompt.value = "";
  els.refs.value = "";
  els.refPreview.innerHTML = "";
  activePresets.clear();
  document.querySelectorAll(".preset.active").forEach(btn => btn.classList.remove("active"));
};

els.clearGalleryBtn.onclick = () => {
  state.gallery = [];
  saveState(); renderGallery();
};

renderPresets();
updatePoints();
renderGallery();
