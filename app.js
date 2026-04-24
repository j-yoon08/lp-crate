const STORAGE_KEY = "lp-crate.records.v1";
const PREFS_KEY = "lp-crate.prefs.v1";
const PLACEHOLDER_COVER = "./assets/record-placeholder.svg";
const MUSICBRAINZ_RELEASE_GROUP_URL = "https://musicbrainz.org/ws/2/release-group/";
const COVER_ART_RELEASE_GROUP_URL = "https://coverartarchive.org/release-group/";
const MUSICBRAINZ_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MUSICBRAINZ_REFRESH_DELAY = 1200;
const CATALOG_SEARCH_LIMIT = 50;
const DIALOG_SEARCH_LIMIT = 24;
const COVER_UPLOAD_LIMIT_BYTES = 900_000;
const STORAGE_BACKUP_PREFIX = "lp-crate.recovered";
const VIEW_MODES = new Set(["board", "wall"]);
const EXPORT_PLACEHOLDER_COVER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
    <rect width="500" height="500" fill="#ececef"/>
    <circle cx="250" cy="250" r="178" fill="#1d1d1f"/>
    <circle cx="250" cy="250" r="58" fill="#f5f5f7"/>
    <circle cx="250" cy="250" r="14" fill="#9a9aa0"/>
  </svg>
`)}`;

const state = {
  records: [],
  filter: "all",
  genre: "all",
  sort: "manual",
  columns: 5,
  viewMode: "board",
  dragId: null,
  dragCatalogResultId: null,
  coverDraft: "",
  albumResults: [],
  albumLookupController: null,
  catalogQuery: "",
  catalogResults: [],
  catalogSearchController: null,
  pendingCatalogAdds: new Set()
};

const els = {
  boardWrap: document.querySelector("#boardWrap"),
  board: document.querySelector("#collectionBoard"),
  emptyState: document.querySelector("#emptyState"),
  miniList: document.querySelector("#miniList"),
  visibleCount: document.querySelector("#visibleCount"),
  ownedCount: document.querySelector("#ownedCount"),
  wishCount: document.querySelector("#wishCount"),
  spinCount: document.querySelector("#spinCount"),
  searchInput: document.querySelector("#searchInput"),
  catalogSearchButton: document.querySelector("#catalogSearchButton"),
  catalogSearchStatus: document.querySelector("#catalogSearchStatus"),
  catalogResults: document.querySelector("#catalogResults"),
  genreFilter: document.querySelector("#genreFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  columnRange: document.querySelector("#columnRange"),
  viewModeButtons: [...document.querySelectorAll("[data-view-mode]")],
  segments: [...document.querySelectorAll("[data-filter]")],
  emptyAddButton: document.querySelector("#emptyAddButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  importJsonButton: document.querySelector("#importJsonButton"),
  exportSvgButton: document.querySelector("#exportSvgButton"),
  exportPngButton: document.querySelector("#exportPngButton"),
  refreshRecordsButton: document.querySelector("#refreshRecordsButton"),
  resetCollectionButton: document.querySelector("#resetCollectionButton"),
  importFileInput: document.querySelector("#importFileInput"),
  dialog: document.querySelector("#recordDialog"),
  form: document.querySelector("#recordForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  cancelDialogButton: document.querySelector("#cancelDialogButton"),
  deleteRecordButton: document.querySelector("#deleteRecordButton"),
  recordId: document.querySelector("#recordId"),
  titleInput: document.querySelector("#titleInput"),
  artistInput: document.querySelector("#artistInput"),
  yearInput: document.querySelector("#yearInput"),
  genreInput: document.querySelector("#genreInput"),
  statusInput: document.querySelector("#statusInput"),
  conditionInput: document.querySelector("#conditionInput"),
  pressingInput: document.querySelector("#pressingInput"),
  ratingInput: document.querySelector("#ratingInput"),
  tagsInput: document.querySelector("#tagsInput"),
  coverInput: document.querySelector("#coverInput"),
  coverFileInput: document.querySelector("#coverFileInput"),
  spinInput: document.querySelector("#spinInput"),
  notesInput: document.querySelector("#notesInput"),
  albumLookupInput: document.querySelector("#albumLookupInput"),
  albumLookupButton: document.querySelector("#albumLookupButton"),
  albumLookupStatus: document.querySelector("#albumLookupStatus"),
  albumResults: document.querySelector("#albumResults"),
  lookupSourceLink: document.querySelector("#lookupSourceLink")
};

function backUpInvalidStorage(key, rawValue, reason) {
  const backupKey = `${STORAGE_BACKUP_PREFIX}.${key}.${Date.now()}`;
  try {
    localStorage.setItem(backupKey, rawValue);
  } catch (error) {
    console.warn(`손상된 저장소 백업에 실패했습니다: ${key}`, error);
  }
  localStorage.removeItem(key);
  console.warn(`저장된 ${key} 값을 복구하지 못해 기본값으로 시작합니다.`, reason);
  setCatalogStatus("저장된 데이터 일부가 손상되어 기본값으로 복구했습니다.", "warning");
}

function parseStoredJson(key, fallback) {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    backUpInvalidStorage(key, rawValue, error);
    return fallback;
  }
}

function load() {
  const storedRecords = parseStoredJson(STORAGE_KEY, []);
  if (Array.isArray(storedRecords)) {
    state.records = storedRecords.map(normalizeRecord);
  } else {
    backUpInvalidStorage(STORAGE_KEY, JSON.stringify(storedRecords), "records must be an array");
    state.records = [];
  }

  const prefs = parseStoredJson(PREFS_KEY, null);
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return;

  if (["all", "owned", "wishlist", "listening"].includes(prefs.filter)) state.filter = prefs.filter;
  if (typeof prefs.genre === "string" && prefs.genre) state.genre = prefs.genre;
  if (["manual", "artist", "year", "rating", "recent"].includes(prefs.sort)) state.sort = prefs.sort;
  if (VIEW_MODES.has(prefs.viewMode)) state.viewMode = prefs.viewMode;

  const columns = Number(prefs.columns);
  if (Number.isFinite(columns)) state.columns = Math.min(8, Math.max(3, columns));
}

function createId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      filter: state.filter,
      genre: state.genre,
      sort: state.sort,
      columns: state.columns,
      viewMode: state.viewMode
    }));
    return true;
  } catch (error) {
    console.error("컬렉션 저장에 실패했습니다.", error);
    setCatalogStatus("브라우저 저장 공간이 부족해 변경사항을 저장하지 못했습니다. 큰 표지 파일을 줄이거나 JSON으로 백업하세요.", "warning");
    return false;
  }
}

function normalizeRecord(record) {
  return {
    id: record.id || createId(),
    title: String(record.title || "").trim(),
    artist: String(record.artist || "").trim(),
    year: String(record.year || "").trim(),
    genre: String(record.genre || "").trim(),
    status: record.status || "owned",
    condition: record.condition || "NM",
    pressing: String(record.pressing || "").trim(),
    rating: Number(record.rating || 0),
    spinCount: Number(record.spinCount || 0),
    lastPlayed: record.lastPlayed || "",
    tags: Array.isArray(record.tags)
      ? record.tags.map(String).filter(Boolean)
      : String(record.tags || "").split(",").map(tag => tag.trim()).filter(Boolean),
    cover: record.cover || PLACEHOLDER_COVER,
    notes: String(record.notes || "")
  };
}

function cloneRecords(records) {
  return records.map(record => ({
    ...record,
    tags: Array.isArray(record.tags) ? [...record.tags] : []
  }));
}

function snapshotCollectionState() {
  return {
    records: cloneRecords(state.records),
    filter: state.filter,
    genre: state.genre,
    sort: state.sort,
    columns: state.columns,
    viewMode: state.viewMode
  };
}

function restoreCollectionState(snapshot) {
  state.records = cloneRecords(snapshot.records);
  state.filter = snapshot.filter;
  state.genre = snapshot.genre;
  state.sort = snapshot.sort;
  state.columns = snapshot.columns;
  state.viewMode = VIEW_MODES.has(snapshot.viewMode) ? snapshot.viewMode : "board";
}

function commitCollectionChange(mutator, failureMessage) {
  const snapshot = snapshotCollectionState();
  mutator();

  if (render()) return true;

  restoreCollectionState(snapshot);
  render();
  alert(failureMessage || "저장 공간이 부족해 변경사항을 저장하지 못했습니다.");
  return false;
}

function statusLabel(status) {
  return {
    owned: "보유",
    wishlist: "위시",
    listening: "청취중"
  }[status] || status;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function artistCreditName(result) {
  if (result.artist) return result.artist;
  return (result["artist-credit"] || [])
    .map(credit => `${credit.name || credit.artist?.name || ""}${credit.joinphrase || ""}`)
    .join("")
    .trim();
}

function albumCoverUrl(id, size = 250) {
  return `${COVER_ART_RELEASE_GROUP_URL}${id}/front-${size}`;
}

function musicBrainzUrl(id) {
  return `https://musicbrainz.org/release-group/${id}`;
}

function setLookupStatus(message, tone = "muted") {
  els.albumLookupStatus.textContent = message;
  els.albumLookupStatus.dataset.tone = tone;
}

function setCatalogStatus(message, tone = "muted") {
  els.catalogSearchStatus.textContent = message;
  els.catalogSearchStatus.dataset.tone = tone;
}

function lookupSearchText() {
  return els.albumLookupInput.value.trim() || [els.titleInput.value, els.artistInput.value].filter(Boolean).join(" ").trim();
}

function lookupResultCover(result, size = 250) {
  return result.coverURL || albumCoverUrl(result.id, size);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 900 * 2 ** attempt;
}

async function fetchMusicBrainzJson(url, { signal, retries = 2 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response = null;

    try {
      response = await fetch(url, {
        signal,
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      if (error.name === "AbortError" || attempt === retries) throw error;
      lastError = error;
      await sleep(900 * 2 ** attempt);
      continue;
    }

    if (response.ok) return response.json();
    if (!MUSICBRAINZ_RETRY_STATUSES.has(response.status) || attempt === retries) {
      throw new Error(`MusicBrainz ${response.status}`);
    }

    await sleep(retryDelay(response, attempt));
  }

  if (lastError) throw lastError;
  throw new Error("MusicBrainz 응답을 받을 수 없습니다.");
}

function renderAlbumResults() {
  els.albumResults.innerHTML = state.albumResults.map(result => {
    const year = (result["first-release-date"] || "").slice(0, 4) || "연도 미상";
    const artist = artistCreditName(result) || "아티스트 미상";
    const source = result.score ? `Match ${result.score}` : "MusicBrainz";
    return `
      <button class="album-result" type="button" data-album-result-id="${escapeText(result.id)}">
        <img src="${escapeText(lookupResultCover(result))}" alt="${escapeText(result.title)} 표지" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}'">
        <span>
          <strong>${escapeText(result.title)}</strong>
          <span>${escapeText(artist)}</span>
          <span>${escapeText(year)} · ${escapeText(source)}</span>
        </span>
      </button>
    `;
  }).join("");
}

function catalogResultKey(result) {
  return `${normalizedText(artistCreditName(result))}::${normalizedText(result.title)}`;
}

function recordKey(record) {
  return `${normalizedText(record.artist)}::${normalizedText(record.title)}`;
}

function renderCatalogResults() {
  els.catalogResults.innerHTML = state.catalogResults.map(result => {
    const year = (result["first-release-date"] || "").slice(0, 4) || "연도 미상";
    const artist = artistCreditName(result) || "아티스트 미상";
    const owned = state.records.some(record => recordKey(record) === catalogResultKey(result));
    const pending = state.pendingCatalogAdds.has(result.id);
    const locked = owned || pending;
    return `
      <article class="catalog-result${owned ? " is-owned" : ""}${pending ? " is-pending" : ""}" draggable="${locked ? "false" : "true"}" data-catalog-result-id="${escapeText(result.id)}">
        <img src="${escapeText(lookupResultCover(result))}" alt="${escapeText(result.title)} 표지" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}'">
        <span>
          <strong>${escapeText(result.title)}</strong>
          <span>${escapeText(artist)}</span>
          <span>${escapeText(year)} · ${pending ? "추가 중" : "MusicBrainz"}</span>
        </span>
        <button type="button" data-add-catalog-id="${escapeText(result.id)}" aria-label="${escapeText(result.title)} 추가" title="추가" ${locked ? "disabled" : ""}>${pending ? "..." : "+"}</button>
      </article>
    `;
  }).join("");
}

async function fetchAlbumCandidates(query, limit = 10, signal = undefined) {
  const params = new URLSearchParams({
    query,
    type: "album",
    fmt: "json",
    limit: String(limit)
  });
  const payload = await fetchMusicBrainzJson(`${MUSICBRAINZ_RELEASE_GROUP_URL}?${params}`, { signal });
  return (payload["release-groups"] || []).filter(result => result.id && result.title);
}

async function searchAlbums() {
  const query = lookupSearchText();
  if (!query) {
    setLookupStatus("앨범명이나 아티스트를 입력하세요.", "warning");
    return;
  }

  state.albumLookupController?.abort();
  state.albumLookupController = new AbortController();
  state.albumResults = [];
  renderAlbumResults();
  setLookupStatus("MusicBrainz에서 검색 중입니다...");

  try {
    state.albumResults = (await fetchAlbumCandidates(query, DIALOG_SEARCH_LIMIT, state.albumLookupController.signal)).slice(0, DIALOG_SEARCH_LIMIT);
    renderAlbumResults();
    setLookupStatus(
      state.albumResults.length ? `MusicBrainz ${state.albumResults.length}개 후보를 찾았습니다. 표지를 보고 맞는 앨범을 선택하세요.` : "검색 결과가 없습니다.",
      state.albumResults.length ? "success" : "warning"
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    setLookupStatus(`검색에 실패했습니다: ${error.message}`, "warning");
  }
}

async function searchCatalog() {
  const query = els.searchInput.value.trim();
  state.catalogQuery = query;
  if (!query) {
    state.catalogResults = [];
    renderCatalogResults();
    setCatalogStatus("앨범명이나 아티스트를 입력하세요.", "warning");
    return;
  }

  state.catalogSearchController?.abort();
  state.catalogSearchController = new AbortController();
  state.catalogResults = [];
  renderCatalogResults();
  setCatalogStatus("MusicBrainz에서 검색 중입니다...");

  try {
    state.catalogResults = (await fetchAlbumCandidates(query, CATALOG_SEARCH_LIMIT, state.catalogSearchController.signal)).slice(0, CATALOG_SEARCH_LIMIT);
    renderCatalogResults();
    setCatalogStatus(
      state.catalogResults.length ? `${state.catalogResults.length}개 후보를 찾았습니다.` : "검색 결과가 없습니다.",
      state.catalogResults.length ? "success" : "warning"
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    setCatalogStatus(`검색에 실패했습니다: ${error.message}`, "warning");
  }
}

function bestGenre(detail) {
  const genres = [...(detail.genres || [])].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  return genres[0]?.name || "";
}

async function lookupAlbumDetails(id) {
  const params = new URLSearchParams({
    inc: "genres+tags",
    fmt: "json"
  });
  return fetchMusicBrainzJson(`${MUSICBRAINZ_RELEASE_GROUP_URL}${id}?${params}`, { retries: 1 }).catch(() => null);
}

async function applyAlbumResult(id) {
  const result = state.albumResults.find(item => item.id === id);
  if (!result) return;

  setLookupStatus("선택한 앨범의 장르 정보를 확인 중입니다...");
  const detail = await lookupAlbumDetails(id).catch(() => null);
  const genre = detail ? bestGenre(detail) : "";
  const year = (result["first-release-date"] || "").slice(0, 4);
  const tags = [
    genre,
    ...(detail?.genres || []).slice(0, 3).map(item => item.name),
    result["primary-type"]
  ].filter(Boolean);

  els.titleInput.value = result.title || "";
  els.artistInput.value = artistCreditName(result);
  els.yearInput.value = year;
  if (genre) els.genreInput.value = genre;
  els.coverInput.value = albumCoverUrl(id, 500);
  els.coverFileInput.value = "";
  els.tagsInput.value = [...new Set(tags)].join(", ");
  els.notesInput.value = [els.notesInput.value, `MusicBrainz: ${musicBrainzUrl(id)}`].filter(Boolean).join("\n");
  els.lookupSourceLink.href = musicBrainzUrl(id);
  state.coverDraft = "";
  setLookupStatus("앨범 정보를 입력칸에 반영했습니다. 컨디션/프레싱만 확인해서 저장하세요.", "success");
}

async function recordFromCatalogResult(result) {
  const detail = await lookupAlbumDetails(result.id).catch(() => null);
  const genre = detail ? bestGenre(detail) : "";
  const year = (result["first-release-date"] || "").slice(0, 4);
  const tags = [
    genre,
    ...(detail?.genres || []).slice(0, 3).map(item => item.name),
    result["primary-type"]
  ].filter(Boolean);

  return normalizeRecord({
    title: result.title,
    artist: artistCreditName(result),
    year,
    genre,
    status: "owned",
    condition: "NM",
    pressing: "",
    rating: 0,
    spinCount: 0,
    tags: [...new Set(tags)],
    cover: albumCoverUrl(result.id, 500),
    notes: `MusicBrainz: ${musicBrainzUrl(result.id)}`
  });
}

async function addCatalogResult(id, targetRecordId = "") {
  const result = state.catalogResults.find(item => item.id === id);
  if (!result) return;
  if (state.pendingCatalogAdds.has(id)) return;

  const key = catalogResultKey(result);
  if (state.records.some(record => recordKey(record) === key)) {
    setCatalogStatus("이미 컬렉션에 있는 LP입니다.", "warning");
    renderCatalogResults();
    return;
  }

  state.pendingCatalogAdds.add(id);
  renderCatalogResults();
  setCatalogStatus("컬렉션에 추가 중입니다...");

  try {
    const record = await recordFromCatalogResult(result);
    if (state.records.some(item => recordKey(item) === key)) {
      setCatalogStatus("이미 컬렉션에 있는 LP입니다.", "warning");
      return;
    }

    const committed = commitCollectionChange(() => {
      const targetIndex = state.records.findIndex(item => item.id === targetRecordId);
      if (targetIndex >= 0) {
        state.records.splice(targetIndex, 0, record);
      } else {
        state.records.unshift(record);
      }
      state.sort = "manual";
    }, "저장 공간이 부족해 검색 결과를 컬렉션에 추가하지 못했습니다.");

    if (committed) {
      setCatalogStatus(`${record.artist} - ${record.title} 추가됨`, "success");
    }
  } catch (error) {
    console.error("검색 결과 추가에 실패했습니다.", error);
    setCatalogStatus(`LP 추가에 실패했습니다: ${error.message}`, "warning");
  } finally {
    state.pendingCatalogAdds.delete(id);
    renderCatalogResults();
  }
}

function filteredRecords() {
  let records = state.records.filter(record => {
    const matchesStatus = state.filter === "all" || record.status === state.filter;
    const matchesGenre = state.genre === "all" || record.genre === state.genre;
    return matchesStatus && matchesGenre;
  });

  if (state.sort !== "manual") {
    records = [...records].sort((a, b) => {
      if (state.sort === "artist") return a.artist.localeCompare(b.artist, "ko");
      if (state.sort === "year") return Number(a.year || 0) - Number(b.year || 0);
      if (state.sort === "rating") return Number(b.rating || 0) - Number(a.rating || 0);
      if (state.sort === "recent") return String(b.lastPlayed || "").localeCompare(String(a.lastPlayed || ""));
      return 0;
    });
  }

  return records;
}

function renderGenreOptions() {
  const genres = [...new Set(state.records.map(record => record.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const current = state.genre;
  els.genreFilter.innerHTML = [
    `<option value="all">전체 장르</option>`,
    ...genres.map(genre => `<option value="${escapeText(genre)}">${escapeText(genre)}</option>`)
  ].join("");
  els.genreFilter.value = genres.includes(current) ? current : "all";
  state.genre = els.genreFilter.value;
}

function renderStats(records) {
  els.ownedCount.textContent = state.records.filter(record => record.status === "owned").length;
  els.wishCount.textContent = state.records.filter(record => record.status === "wishlist").length;
  els.spinCount.textContent = state.records.reduce((sum, record) => sum + Number(record.spinCount || 0), 0);
  els.visibleCount.textContent = `${records.length}장`;
}

function renderMiniList(records) {
  els.miniList.innerHTML = records.map(record => `
    <li>
      <button type="button" data-edit-id="${escapeText(record.id)}">
        <img src="${escapeText(record.cover || PLACEHOLDER_COVER)}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}'">
        <span>
          <span class="mini-title">${escapeText(record.title)}</span>
          <span class="mini-artist">${escapeText(record.artist)}</span>
        </span>
        <span class="status-dot ${escapeText(record.status)}" aria-label="${escapeText(statusLabel(record.status))}"></span>
      </button>
    </li>
  `).join("");
}

function renderBoard(records) {
  els.board.style.setProperty("--columns", state.columns);
  els.board.dataset.viewMode = state.viewMode;
  els.boardWrap.dataset.viewMode = state.viewMode;
  els.board.innerHTML = records.map(record => `
    <article class="record-card" draggable="true" data-record-id="${escapeText(record.id)}">
      <img class="record-cover" src="${escapeText(record.cover || PLACEHOLDER_COVER)}" alt="${escapeText(record.title)} 표지" onerror="this.onerror=null;this.src='${PLACEHOLDER_COVER}'">
      <div class="card-actions">
        <button type="button" data-spin-id="${escapeText(record.id)}" aria-label="재생 횟수 추가" title="재생 횟수 추가">+</button>
        <button type="button" data-edit-id="${escapeText(record.id)}" aria-label="수정" title="수정">✎</button>
      </div>
      <div class="record-body">
        <div class="record-kicker">
          <span>${escapeText(statusLabel(record.status))}</span>
          <span>${escapeText(record.condition)}</span>
        </div>
        <h3 class="record-title">${escapeText(record.title)}</h3>
        <span class="record-artist">${escapeText(record.artist)}</span>
        <div class="record-meta">
          ${record.year ? `<span class="pill">${escapeText(record.year)}</span>` : ""}
          ${record.genre ? `<span class="pill">${escapeText(record.genre)}</span>` : ""}
          ${record.pressing ? `<span class="pill">${escapeText(record.pressing)}</span>` : ""}
          ${record.rating ? `<span class="pill">★ ${escapeText(record.rating)}</span>` : ""}
          ${record.spinCount ? `<span class="pill">${escapeText(record.spinCount)}회</span>` : ""}
        </div>
      </div>
    </article>
  `).join("");

  els.emptyState.hidden = records.length > 0;
}

function render() {
  state.records = state.records.map(normalizeRecord);
  renderGenreOptions();
  const records = filteredRecords();
  renderStats(records);
  renderMiniList(records);
  renderBoard(records);
  els.sortSelect.value = state.sort;
  els.columnRange.value = state.columns;
  els.segments.forEach(button => button.classList.toggle("is-active", button.dataset.filter === state.filter));
  els.viewModeButtons.forEach(button => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  return save();
}

function openDialog(record = null) {
  state.coverDraft = "";
  state.albumResults = [];
  renderAlbumResults();
  els.form.reset();
  els.coverFileInput.value = "";
  els.albumLookupInput.value = record ? [record.title, record.artist].filter(Boolean).join(" ") : "";
  els.lookupSourceLink.href = "https://musicbrainz.org/";
  setLookupStatus("MusicBrainz에서 실제 앨범 후보와 표지를 확인할 수 있습니다.");
  els.recordId.value = record?.id || "";
  els.dialogTitle.textContent = record ? "LP 수정" : "LP 추가";
  els.titleInput.value = record?.title || "";
  els.artistInput.value = record?.artist || "";
  els.yearInput.value = record?.year || "";
  els.genreInput.value = record?.genre || "";
  els.statusInput.value = record?.status || "owned";
  els.conditionInput.value = record?.condition || "NM";
  els.pressingInput.value = record?.pressing || "";
  els.ratingInput.value = record?.rating || "";
  els.tagsInput.value = record?.tags?.join(", ") || "";
  els.coverInput.value = record?.cover && !record.cover.startsWith("data:") ? record.cover : "";
  els.spinInput.value = record?.spinCount || 0;
  els.notesInput.value = record?.notes || "";
  els.deleteRecordButton.hidden = !record;
  els.dialog.showModal();
}

function closeDialog() {
  els.dialog.close();
}

function recordFromForm() {
  const id = els.recordId.value || createId();
  const existing = state.records.find(record => record.id === id);
  return normalizeRecord({
    id,
    title: els.titleInput.value,
    artist: els.artistInput.value,
    year: els.yearInput.value,
    genre: els.genreInput.value,
    status: els.statusInput.value,
    condition: els.conditionInput.value,
    pressing: els.pressingInput.value,
    rating: els.ratingInput.value,
    tags: els.tagsInput.value,
    cover: state.coverDraft || els.coverInput.value || existing?.cover || PLACEHOLDER_COVER,
    spinCount: els.spinInput.value,
    notes: els.notesInput.value,
    lastPlayed: existing?.lastPlayed || ""
  });
}

function saveRecord(event) {
  event.preventDefault();
  const record = recordFromForm();
  const committed = commitCollectionChange(() => {
    const index = state.records.findIndex(item => item.id === record.id);
    if (index >= 0) {
      state.records[index] = record;
    } else {
      state.records.unshift(record);
    }
  }, "저장 공간이 부족해 LP 정보를 저장하지 못했습니다.");
  if (committed) closeDialog();
}

function deleteRecord() {
  const id = els.recordId.value;
  if (!confirm("이 LP를 컬렉션에서 삭제할까요?")) return;
  const committed = commitCollectionChange(() => {
    state.records = state.records.filter(record => record.id !== id);
  }, "저장 공간이 부족해 삭제 결과를 저장하지 못했습니다.");
  if (committed) closeDialog();
}

function findRecord(id) {
  return state.records.find(record => record.id === id);
}

function incrementSpin(id) {
  const record = findRecord(id);
  if (!record) return;
  commitCollectionChange(() => {
    record.spinCount = Number(record.spinCount || 0) + 1;
    record.lastPlayed = new Date().toISOString().slice(0, 10);
  }, "저장 공간이 부족해 재생 횟수를 저장하지 못했습니다.");
}

function moveRecord(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = state.records.findIndex(record => record.id === sourceId);
  const targetIndex = state.records.findIndex(record => record.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  commitCollectionChange(() => {
    const [record] = state.records.splice(sourceIndex, 1);
    state.records.splice(targetIndex, 0, record);
    state.sort = "manual";
  }, "저장 공간이 부족해 순서를 저장하지 못했습니다.");
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  downloadBlobObject(filename, blob);
}

function downloadBlobObject(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), records: state.records }, null, 2);
  downloadBlob("lp-crate-collection.json", payload, "application/json");
}

function importJson(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) throw new Error("Invalid collection file");
      if (!confirm("현재 컬렉션을 가져온 JSON으로 교체할까요?")) return;
      commitCollectionChange(() => {
        state.records = records.map(normalizeRecord);
        state.sort = "manual";
      }, "저장 공간이 부족해 가져온 컬렉션을 저장하지 못했습니다.");
    } catch (error) {
      alert(`가져오기에 실패했습니다: ${error.message}`);
    }
  });
  reader.readAsText(file);
}

function compactNotes(notes) {
  return String(notes || "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !/topsters?|last\.fm|imported from|^MusicBrainz:/i.test(line))
    .join("\n");
}

function cleanTags(tags) {
  return [...new Set((tags || []).filter(tag => !/^topsters?$/i.test(tag)))];
}

function cleanLegacyRecord(record) {
  return normalizeRecord({
    ...record,
    tags: cleanTags(record.tags),
    notes: compactNotes(record.notes)
  });
}

function albumMatchScore(record, candidate) {
  const recordTitle = normalizedText(record.title);
  const recordArtist = normalizedText(record.artist);
  const candidateTitle = normalizedText(candidate.title);
  const candidateArtist = normalizedText(artistCreditName(candidate));
  let score = Number(candidate.score || 0);
  if (candidateTitle === recordTitle) score += 80;
  if (candidateArtist === recordArtist) score += 80;
  if (candidateTitle.includes(recordTitle) || recordTitle.includes(candidateTitle)) score += 24;
  if (candidateArtist.includes(recordArtist) || recordArtist.includes(candidateArtist)) score += 24;
  return score;
}

function bestAlbumMatch(record, candidates) {
  const match = [...candidates].sort((a, b) => albumMatchScore(record, b) - albumMatchScore(record, a))[0] || null;
  return match && albumMatchScore(record, match) >= 124 ? match : null;
}

async function enrichRecord(record) {
  const baseRecord = cleanLegacyRecord(record);
  const query = [record.title, record.artist].filter(Boolean).join(" ");
  if (!query) return { record: baseRecord, matched: false };

  const candidates = await fetchAlbumCandidates(query, 5);
  const match = bestAlbumMatch(record, candidates);
  if (!match) return { record: baseRecord, matched: false };

  const detail = await lookupAlbumDetails(match.id).catch(() => null);
  const genre = detail ? bestGenre(detail) : "";
  const year = (match["first-release-date"] || "").slice(0, 4);
  const tags = cleanTags(baseRecord.tags);
  const sourceLine = `MusicBrainz: ${musicBrainzUrl(match.id)}`;
  const shouldReplaceCover = !baseRecord.cover
    || baseRecord.cover === PLACEHOLDER_COVER
    || /lastfm\.freetls\.fastly\.net|coverartarchive\.org/i.test(baseRecord.cover);

  return {
    record: normalizeRecord({
      ...baseRecord,
      title: match.title || baseRecord.title,
      artist: artistCreditName(match) || baseRecord.artist,
      year: year || baseRecord.year,
      genre: genre || baseRecord.genre,
      cover: shouldReplaceCover ? albumCoverUrl(match.id, 500) : baseRecord.cover,
      tags: [...new Set([...tags, genre, match["primary-type"]].filter(Boolean))],
      notes: [baseRecord.notes, sourceLine].filter(Boolean).join("\n")
    }),
    matched: true
  };
}

async function refreshRecords() {
  if (!state.records.length) {
    alert("최신화할 LP가 없습니다.");
    return;
  }

  const buttonLabel = els.refreshRecordsButton.innerHTML;
  els.refreshRecordsButton.disabled = true;
  els.refreshRecordsButton.innerHTML = `<span aria-hidden="true">...</span> 확인 중`;

  let matchedCount = 0;
  let unmatchedCount = 0;
  let failedCount = 0;
  const refreshed = [];
  const total = state.records.length;

  for (const [index, record] of state.records.entries()) {
    els.refreshRecordsButton.innerHTML = `<span aria-hidden="true">...</span> ${index + 1}/${total}`;

    try {
      if (index > 0) await sleep(MUSICBRAINZ_REFRESH_DELAY);
      const result = await enrichRecord(normalizeRecord(record));
      if (result.matched) matchedCount += 1;
      if (!result.matched) unmatchedCount += 1;
      refreshed.push(result.record);
    } catch (error) {
      failedCount += 1;
      refreshed.push(cleanLegacyRecord(normalizeRecord(record)));
    }
  }

  const committed = commitCollectionChange(() => {
    state.records = refreshed;
  }, "저장 공간이 부족해 최신화 결과를 저장하지 못했습니다.");
  els.refreshRecordsButton.disabled = false;
  els.refreshRecordsButton.innerHTML = buttonLabel;

  if (!committed) return;

  const summary = [
    `${matchedCount}개 갱신`,
    unmatchedCount ? `${unmatchedCount}개 미매칭` : "",
    failedCount ? `${failedCount}개 일시 실패` : ""
  ].filter(Boolean).join(", ");
  alert(`최신화 완료: ${summary}${failedCount ? "\\nMusicBrainz가 불안정하면 잠시 후 다시 눌러 주세요." : ""}`);
}

function resetCollection() {
  if (!state.records.length) {
    alert("이미 빈 컬렉션입니다.");
    return;
  }

  const confirmed = confirm("현재 브라우저에 저장된 모든 LP를 삭제하고 빈 컬렉션으로 초기화할까요? JSON 백업이 없다면 되돌릴 수 없습니다.");
  if (!confirmed) return;

  state.records = [];
  state.filter = "all";
  state.genre = "all";
  state.sort = "manual";
  state.columns = 5;
  state.dragId = null;
  state.dragCatalogResultId = null;
  state.pendingCatalogAdds.clear();
  state.albumResults = [];
  state.albumLookupController?.abort();
  state.catalogResults = [];
  state.catalogQuery = "";
  state.catalogSearchController?.abort();
  els.searchInput.value = "";
  renderCatalogResults();
  setCatalogStatus("MusicBrainz에서 LP를 검색합니다.");
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREFS_KEY);
  render();
  alert("컬렉션을 초기화했습니다.");
}

function svgText(value, max = 34) {
  const text = String(value || "");
  return escapeText(text.length > max ? `${text.slice(0, max - 1)}…` : text);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error || new Error("이미지를 읽을 수 없습니다.")));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 만들 수 없습니다."));
    }, type, quality);
  });
}

function loadExportImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("표지를 불러올 수 없습니다.")), { once: true });
    image.src = src;
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + width - corner, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + corner);
  ctx.lineTo(x + width, y + height - corner);
  ctx.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  ctx.lineTo(x + corner, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - corner);
  ctx.lineTo(x, y + corner);
  ctx.quadraticCurveTo(x, y, x + corner, y);
  ctx.closePath();
}

function drawCoverToCanvas(ctx, image, x, y, size, radius = 14) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > 1) {
    sourceWidth = image.naturalHeight;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (sourceRatio < 1) {
    sourceHeight = image.naturalWidth;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.save();
  drawRoundedRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, size, size, radius);
  ctx.stroke();
}

function shareGrid(recordsLength) {
  const count = Math.max(recordsLength, 1);
  const columns = count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : count <= 25 ? 5 : count <= 36 ? 6 : 7;
  return {
    columns,
    rows: Math.ceil(Math.min(count, 49) / columns)
  };
}

async function coverToExportHref(cover) {
  const source = cover || PLACEHOLDER_COVER;
  if (source.startsWith("data:image/")) return source;
  if (source === PLACEHOLDER_COVER) return EXPORT_PLACEHOLDER_COVER;

  if (/^https?:\/\//i.test(source) || source.startsWith("./assets/")) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`cover ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("cover is not an image");
    return blobToDataUrl(blob);
  }

  return EXPORT_PLACEHOLDER_COVER;
}

async function coverImageForExport(record) {
  try {
    return await loadExportImage(await coverToExportHref(record.cover));
  } catch (error) {
    console.warn("공유 이미지 표지 로드에 실패했습니다.", record.title, error);
    return loadExportImage(EXPORT_PLACEHOLDER_COVER);
  }
}

async function exportSvg() {
  const records = filteredRecords();
  const buttonLabel = els.exportSvgButton.innerHTML;
  els.exportSvgButton.disabled = true;
  els.exportSvgButton.innerHTML = `<span aria-hidden="true">...</span> SVG`;

  try {
    let fallbackCount = 0;
    const covers = await Promise.all(records.map(async record => {
      try {
        return await coverToExportHref(record.cover);
      } catch (error) {
        fallbackCount += 1;
        console.warn("SVG 내보내기 커버 임베드에 실패했습니다.", record.title, error);
        return EXPORT_PLACEHOLDER_COVER;
      }
    }));

    const columns = Math.min(Number(state.columns), Math.max(records.length, 1));
    const tile = 260;
    const infoHeight = 86;
    const gap = 22;
    const margin = 32;
    const rows = Math.max(Math.ceil(records.length / columns), 1);
    const width = margin * 2 + columns * tile + (columns - 1) * gap;
    const height = margin * 2 + rows * (tile + infoHeight) + (rows - 1) * gap + 76;
    const cards = records.map((record, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * (tile + gap);
      const y = margin + 76 + row * (tile + infoHeight + gap);
      const cover = covers[index] || EXPORT_PLACEHOLDER_COVER;
      return `
        <g transform="translate(${x} ${y})">
          <rect width="${tile}" height="${tile + infoHeight}" rx="8" fill="#171411" stroke="#393229"/>
          <image href="${escapeText(cover)}" x="0" y="0" width="${tile}" height="${tile}" preserveAspectRatio="xMidYMid slice"/>
          <text x="14" y="${tile + 30}" fill="#f7efe2" font-family="Arial, sans-serif" font-size="18" font-weight="700">${svgText(record.title, 27)}</text>
          <text x="14" y="${tile + 56}" fill="#a9a095" font-family="Arial, sans-serif" font-size="14">${svgText(record.artist, 31)}</text>
          <text x="14" y="${tile + 78}" fill="#d6ad59" font-family="Arial, sans-serif" font-size="12">${svgText([record.year, record.condition, statusLabel(record.status)].filter(Boolean).join(" · "), 38)}</text>
        </g>
      `;
    }).join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#11100e"/>
      <text x="${margin}" y="${margin + 24}" fill="#d6ad59" font-family="Arial, sans-serif" font-size="14">LP Crate</text>
      <text x="${margin}" y="${margin + 58}" fill="#f7efe2" font-family="Arial, sans-serif" font-size="34" font-weight="700">소장 LP 확인</text>
      ${cards}
    </svg>`;
    downloadBlob("lp-crate-board.svg", svg, "image/svg+xml");
    setCatalogStatus(fallbackCount ? `${fallbackCount}개 표지는 임시 이미지로 대체해 SVG를 저장했습니다.` : "SVG를 저장했습니다.", fallbackCount ? "warning" : "success");
  } catch (error) {
    console.error("SVG 내보내기에 실패했습니다.", error);
    setCatalogStatus(`SVG 내보내기에 실패했습니다: ${error.message}`, "warning");
  } finally {
    els.exportSvgButton.disabled = false;
    els.exportSvgButton.innerHTML = buttonLabel;
  }
}

async function exportSharePng() {
  const records = filteredRecords();
  const buttonLabel = els.exportPngButton.innerHTML;
  els.exportPngButton.disabled = true;
  els.exportPngButton.innerHTML = `<span aria-hidden="true">...</span> PNG`;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    const displayRecords = records.slice(0, 49);
    const hiddenCount = Math.max(records.length - displayRecords.length, 0);

    ctx.fillStyle = "#f5f5f7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "700 54px Inter, system-ui, sans-serif";
    ctx.fillText("LP Crate", 56, 86);
    ctx.font = "500 25px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#6e6e73";
    const filterSummary = {
      all: "All records",
      owned: "Owned",
      wishlist: "Wishlist",
      listening: "Listening"
    }[state.filter] || "Collection";
    ctx.fillText(`${records.length} records · ${filterSummary}`, 58, 124);

    if (!displayRecords.length) {
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, 210, 346, 660, 260, 24);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.stroke();
      ctx.fillStyle = "#1d1d1f";
      ctx.font = "700 36px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("표시할 LP가 없습니다", 540, 470);
      ctx.font = "500 22px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#6e6e73";
      ctx.fillText("필터를 바꾸거나 LP를 추가하세요", 540, 512);
      ctx.textAlign = "start";
    } else {
      const { columns, rows } = shareGrid(displayRecords.length);
      const padding = 56;
      const top = 164;
      const bottom = 46;
      const gap = columns >= 6 ? 10 : 14;
      const availableWidth = canvas.width - padding * 2;
      const availableHeight = canvas.height - top - bottom;
      const tile = Math.floor(Math.min(
        (availableWidth - gap * (columns - 1)) / columns,
        (availableHeight - gap * (rows - 1)) / rows
      ));
      const gridWidth = tile * columns + gap * (columns - 1);
      const gridHeight = tile * rows + gap * (rows - 1);
      const startX = Math.floor((canvas.width - gridWidth) / 2);
      const startY = top + Math.floor((availableHeight - gridHeight) / 2);
      const images = await Promise.all(displayRecords.map(coverImageForExport));

      images.forEach((image, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = startX + col * (tile + gap);
        const y = startY + row * (tile + gap);
        drawCoverToCanvas(ctx, image, x, y, tile, columns >= 6 ? 10 : 14);

        if (hiddenCount && index === images.length - 1) {
          ctx.save();
          drawRoundedRect(ctx, x, y, tile, tile, columns >= 6 ? 10 : 14);
          ctx.clip();
          ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
          ctx.fillRect(x, y, tile, tile);
          ctx.restore();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `700 ${Math.max(28, Math.floor(tile * 0.24))}px Inter, system-ui, sans-serif`;
          ctx.fillText(`+${hiddenCount}`, x + tile / 2, y + tile / 2);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
      });
    }

    downloadBlobObject("lp-crate-cover-wall.png", await canvasToBlob(canvas));
    setCatalogStatus("공유용 PNG를 저장했습니다.", "success");
  } catch (error) {
    console.error("PNG 내보내기에 실패했습니다.", error);
    setCatalogStatus(`PNG 내보내기에 실패했습니다: ${error.message}`, "warning");
  } finally {
    els.exportPngButton.disabled = false;
    els.exportPngButton.innerHTML = buttonLabel;
  }
}

function bindEvents() {
  els.emptyAddButton.addEventListener("click", () => openDialog());
  els.closeDialogButton.addEventListener("click", closeDialog);
  els.cancelDialogButton.addEventListener("click", closeDialog);
  els.form.addEventListener("submit", saveRecord);
  els.deleteRecordButton.addEventListener("click", deleteRecord);
  els.albumLookupButton.addEventListener("click", searchAlbums);
  els.albumLookupInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchAlbums();
  });
  els.albumResults.addEventListener("click", event => {
    const button = event.target.closest("[data-album-result-id]");
    if (button) applyAlbumResult(button.dataset.albumResultId);
  });

  els.catalogSearchButton.addEventListener("click", searchCatalog);
  els.searchInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchCatalog();
  });
  els.catalogResults.addEventListener("click", event => {
    const button = event.target.closest("[data-add-catalog-id]");
    if (button) addCatalogResult(button.dataset.addCatalogId);
  });
  els.catalogResults.addEventListener("dragstart", event => {
    const result = event.target.closest("[data-catalog-result-id]");
    if (!result) return;
    if (result.classList.contains("is-owned") || result.classList.contains("is-pending")) {
      event.preventDefault();
      return;
    }
    state.dragCatalogResultId = result.dataset.catalogResultId;
    result.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-lp-catalog-result", state.dragCatalogResultId);
  });
  els.catalogResults.addEventListener("dragend", event => {
    event.target.closest("[data-catalog-result-id]")?.classList.remove("is-dragging");
    state.dragCatalogResultId = null;
    els.boardWrap.classList.remove("is-catalog-drop");
  });

  els.genreFilter.addEventListener("change", event => {
    state.genre = event.target.value;
    render();
  });

  els.sortSelect.addEventListener("change", event => {
    state.sort = event.target.value;
    render();
  });

  els.columnRange.addEventListener("input", event => {
    state.columns = Number(event.target.value);
    render();
  });

  els.viewModeButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.viewMode = VIEW_MODES.has(button.dataset.viewMode) ? button.dataset.viewMode : "board";
      render();
    });
  });

  els.segments.forEach(button => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  document.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit-id]");
    const spinButton = event.target.closest("[data-spin-id]");
    if (editButton) openDialog(findRecord(editButton.dataset.editId));
    if (spinButton) incrementSpin(spinButton.dataset.spinId);
  });

  els.board.addEventListener("dragstart", event => {
    const card = event.target.closest("[data-record-id]");
    if (!card) return;
    state.dragId = card.dataset.recordId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  els.board.addEventListener("dragend", event => {
    event.target.closest("[data-record-id]")?.classList.remove("is-dragging");
    state.dragId = null;
  });

  els.board.addEventListener("dragover", event => {
    if (state.dragId) event.preventDefault();
  });

  els.board.addEventListener("drop", event => {
    if (state.dragCatalogResultId) return;
    const card = event.target.closest("[data-record-id]");
    if (!card) return;
    event.preventDefault();
    moveRecord(state.dragId, card.dataset.recordId);
  });

  els.boardWrap.addEventListener("dragover", event => {
    if (!state.dragCatalogResultId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    els.boardWrap.classList.add("is-catalog-drop");
  });

  els.boardWrap.addEventListener("dragleave", event => {
    if (!els.boardWrap.contains(event.relatedTarget)) {
      els.boardWrap.classList.remove("is-catalog-drop");
    }
  });

  els.boardWrap.addEventListener("drop", event => {
    if (!state.dragCatalogResultId) return;
    event.preventDefault();
    const card = event.target.closest("[data-record-id]");
    addCatalogResult(state.dragCatalogResultId, card?.dataset.recordId || "");
    state.dragCatalogResultId = null;
    els.boardWrap.classList.remove("is-catalog-drop");
  });

  els.coverFileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > COVER_UPLOAD_LIMIT_BYTES) {
      event.target.value = "";
      state.coverDraft = "";
      setLookupStatus("표지 파일은 900KB 이하만 저장할 수 있습니다. 큰 이미지는 표지 URL을 사용하세요.", "warning");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      state.coverDraft = String(reader.result);
      els.coverInput.value = "";
      setLookupStatus("표지 파일을 임시로 불러왔습니다. 저장하면 컬렉션에 반영됩니다.", "success");
    });
    reader.readAsDataURL(file);
  });

  els.exportJsonButton.addEventListener("click", exportJson);
  els.importJsonButton.addEventListener("click", () => els.importFileInput.click());
  els.exportSvgButton.addEventListener("click", exportSvg);
  els.exportPngButton.addEventListener("click", exportSharePng);
  els.refreshRecordsButton.addEventListener("click", refreshRecords);
  els.resetCollectionButton.addEventListener("click", resetCollection);
  els.importFileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    event.target.value = "";
  });
}

load();
bindEvents();
render();
