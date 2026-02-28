const openComposeBtn = document.getElementById("open-compose-btn");
const composeScreen = document.getElementById("compose-screen");
const closeComposeBtn = document.getElementById("close-compose-btn");
const composeTitleEl = document.getElementById("compose-title");

const postForm = document.getElementById("post-form");
const titleInput = document.getElementById("title");
const contentInput = document.getElementById("content");
const imageInput = document.getElementById("image");
const imagePreviewWrap = document.getElementById("image-preview-wrap");
const imagePreview = document.getElementById("image-preview");
const removeImageBtn = document.getElementById("remove-image-btn");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const formMessageEl = document.getElementById("form-message");
const markdownPreviewEl = document.getElementById("markdown-preview");

const postListEl = document.getElementById("post-list");
const postViewEl = document.getElementById("post-view");
const postCountEl = document.getElementById("post-count");
const viewerActions = document.getElementById("viewer-actions");
const likeBtn = document.getElementById("like-btn");
const likeCountEl = document.getElementById("like-count");
const editBtn = document.getElementById("edit-btn");
const deleteBtn = document.getElementById("delete-btn");

const commentForm = document.getElementById("comment-form");
const commentInput = document.getElementById("comment-input");
const commentListEl = document.getElementById("comment-list");

const state = {
  posts: [],
  selectedId: null,
  editingId: null,
  formImageDataUrl: ""
};
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;

if (window.marked && typeof window.marked.setOptions === "function") {
  window.marked.setOptions({
    gfm: true,
    breaks: true
  });
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "요청 중 문제가 생겼어.");
  }
  return data;
}

function setMessage(message, isError = false) {
  formMessageEl.textContent = message || "";
  formMessageEl.style.color = isError ? "#fca5a5" : "#a3a9b4";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_~\-]+/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function renderMarkdown(markdown) {
  const source = typeof markdown === "string" ? markdown : "";

  if (!source.trim()) {
    return '<p class="preview-empty">여기에 마크다운 미리보기가 보여.</p>';
  }

  if (!window.marked || typeof window.marked.parse !== "function") {
    return `<pre>${escapeHtml(source)}</pre>`;
  }

  const rawHtml = window.marked.parse(source);
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
    return window.DOMPurify.sanitize(rawHtml);
  }
  return rawHtml;
}

function renderPreview() {
  markdownPreviewEl.innerHTML = renderMarkdown(contentInput.value);
}

function renderFormImagePreview() {
  if (!state.formImageDataUrl) {
    imagePreviewWrap.classList.add("hidden");
    imagePreview.removeAttribute("src");
    return;
  }

  imagePreview.src = state.formImageDataUrl;
  imagePreviewWrap.classList.remove("hidden");
}

function setCommentFormEnabled(enabled) {
  commentInput.disabled = !enabled;
  commentForm.querySelector("button").disabled = !enabled;
}

function openCompose() {
  composeScreen.classList.remove("hidden");
}

function closeCompose() {
  composeScreen.classList.add("hidden");
}

function prepareCreateForm() {
  state.editingId = null;
  state.formImageDataUrl = "";
  postForm.reset();
  imageInput.value = "";
  composeTitleEl.textContent = "새 글 작성";
  submitBtn.textContent = "작성하기";
  cancelEditBtn.classList.add("hidden");
  renderFormImagePreview();
  renderPreview();
  setMessage("");
}

function getSelectedPost() {
  return state.posts.find((post) => post.id === state.selectedId) || null;
}

function renderList() {
  postCountEl.textContent = `${state.posts.length}개`;

  if (!state.posts.length) {
    postListEl.innerHTML = '<li class="post-item">아직 글이 없어. 상단 글작성 버튼 눌러서 작성해줘.</li>';
    return;
  }

  postListEl.innerHTML = state.posts
    .map((post) => {
      const isActive = post.id === state.selectedId;
      const excerptSource = stripMarkdown(post.content);
      const excerpt = excerptSource.length > 60 ? `${excerptSource.slice(0, 60)}...` : excerptSource;
      const likes = Number.isFinite(post.likes) ? post.likes : 0;
      const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

      return `
        <li class="post-item ${isActive ? "active" : ""}" data-id="${post.id}">
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(excerpt || "(내용 없음)")}</p>
          <div class="meta">${formatDate(post.updatedAt)}</div>
          <div class="stats">좋아요 ${likes} · 댓글 ${commentsCount}</div>
        </li>
      `;
    })
    .join("");
}

function renderComments(post) {
  if (!post) {
    commentListEl.innerHTML = '<li class="comment-empty">글을 선택하면 댓글이 보여.</li>';
    setCommentFormEnabled(false);
    return;
  }

  setCommentFormEnabled(true);

  const comments = Array.isArray(post.comments)
    ? [...post.comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  if (!comments.length) {
    commentListEl.innerHTML = '<li class="comment-empty">아직 댓글이 없어.</li>';
    return;
  }

  commentListEl.innerHTML = comments
    .map((comment) => {
      return `
        <li class="comment-item">
          <div class="comment-head">
            <div class="meta">${formatDate(comment.createdAt)}</div>
            <button
              class="btn btn-danger btn-small comment-delete-btn"
              type="button"
              data-comment-id="${escapeHtml(comment.id)}"
            >
              삭제
            </button>
          </div>
          <p class="comment-text">${escapeHtml(comment.text)}</p>
        </li>
      `;
    })
    .join("");
}

function renderViewer() {
  const post = getSelectedPost();
  if (!post) {
    postViewEl.classList.add("empty");
    postViewEl.innerHTML = "왼쪽 목록에서 글을 선택하면 여기 보인다.";
    viewerActions.classList.add("hidden");
    likeCountEl.textContent = "0";
    renderComments(null);
    return;
  }

  const likes = Number.isFinite(post.likes) ? post.likes : 0;
  const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;
  const imageMarkup = post.imageDataUrl
    ? `<img class="post-image" src="${escapeHtml(post.imageDataUrl)}" alt="첨부 이미지" />`
    : "";

  postViewEl.classList.remove("empty");
  postViewEl.innerHTML = `
    <h3>${escapeHtml(post.title)}</h3>
    <div class="meta">작성: ${formatDate(post.createdAt)} · 수정: ${formatDate(post.updatedAt)}</div>
    <div class="content markdown-body">${renderMarkdown(post.content)}</div>
    ${imageMarkup}
    <div class="stats">좋아요 ${likes} · 댓글 ${commentsCount}</div>
  `;

  likeCountEl.textContent = String(likes);
  viewerActions.classList.remove("hidden");
  renderComments(post);
}

function renderAll() {
  renderList();
  renderViewer();
}

async function loadPosts() {
  const data = await api("/api/posts");
  state.posts = data.posts || [];

  if (state.selectedId && !state.posts.some((post) => post.id === state.selectedId)) {
    state.selectedId = null;
  }

  if (!state.selectedId && state.posts.length > 0) {
    state.selectedId = state.posts[0].id;
  }

  renderAll();
}

function startEdit(post) {
  state.editingId = post.id;
  state.formImageDataUrl = typeof post.imageDataUrl === "string" ? post.imageDataUrl : "";
  titleInput.value = post.title;
  contentInput.value = post.content;
  imageInput.value = "";
  composeTitleEl.textContent = "글 수정";
  submitBtn.textContent = "수정 저장";
  cancelEditBtn.classList.remove("hidden");
  renderFormImagePreview();
  renderPreview();
  setMessage("수정 모드야. 저장 누르면 반영돼.");
  openCompose();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지 읽기 중 문제가 생겼어."));
    reader.readAsDataURL(file);
  });
}

async function handleImageChange() {
  const file = imageInput.files && imageInput.files[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setMessage("이미지 파일만 첨부할 수 있어.", true);
    imageInput.value = "";
    return;
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    setMessage("이미지는 10MB 이하로 올려줘.", true);
    imageInput.value = "";
    return;
  }

  try {
    state.formImageDataUrl = await readFileAsDataUrl(file);
    renderFormImagePreview();
    setMessage("사진 첨부 완료.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    setMessage("제목이랑 내용을 둘 다 입력해줘.", true);
    return;
  }

  try {
    const payload = {
      title,
      content,
      imageDataUrl: state.formImageDataUrl
    };

    if (state.editingId) {
      const data = await api(`/api/posts/${encodeURIComponent(state.editingId)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      state.selectedId = data.post.id;
    } else {
      const data = await api("/api/posts", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.selectedId = data.post.id;
    }

    await loadPosts();
    prepareCreateForm();
    closeCompose();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDelete() {
  const post = getSelectedPost();
  if (!post) {
    return;
  }

  const ok = window.confirm(`"${post.title}" 글을 삭제할까?`);
  if (!ok) {
    return;
  }

  try {
    await api(`/api/posts/${encodeURIComponent(post.id)}`, {
      method: "DELETE"
    });
    state.selectedId = null;
    if (state.editingId === post.id) {
      prepareCreateForm();
      closeCompose();
    }
    await loadPosts();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleLike() {
  const post = getSelectedPost();
  if (!post) {
    return;
  }

  try {
    await api(`/api/posts/${encodeURIComponent(post.id)}/like`, {
      method: "POST"
    });
    await loadPosts();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();

  const post = getSelectedPost();
  if (!post) {
    return;
  }

  const text = commentInput.value.trim();
  if (!text) {
    return;
  }

  try {
    await api(`/api/posts/${encodeURIComponent(post.id)}/comments`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    commentInput.value = "";
    await loadPosts();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleCommentDelete(commentId) {
  const post = getSelectedPost();
  if (!post || !commentId) {
    return;
  }

  const ok = window.confirm("댓글을 삭제할까?");
  if (!ok) {
    return;
  }

  try {
    await api(`/api/posts/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE"
    });
    await loadPosts();
  } catch (error) {
    window.alert(error.message);
  }
}

openComposeBtn.addEventListener("click", () => {
  prepareCreateForm();
  openCompose();
});

closeComposeBtn.addEventListener("click", () => {
  closeCompose();
});

postForm.addEventListener("submit", handleSubmit);
cancelEditBtn.addEventListener("click", () => {
  prepareCreateForm();
});
removeImageBtn.addEventListener("click", () => {
  state.formImageDataUrl = "";
  imageInput.value = "";
  renderFormImagePreview();
  setMessage("사진을 제거했어.");
});
imageInput.addEventListener("change", handleImageChange);
contentInput.addEventListener("input", renderPreview);

editBtn.addEventListener("click", () => {
  const post = getSelectedPost();
  if (post) {
    startEdit(post);
  }
});

likeBtn.addEventListener("click", handleLike);
deleteBtn.addEventListener("click", handleDelete);
commentForm.addEventListener("submit", handleCommentSubmit);
commentListEl.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest(".comment-delete-btn[data-comment-id]");
  if (!deleteBtn) {
    return;
  }

  handleCommentDelete(deleteBtn.dataset.commentId);
});

postListEl.addEventListener("click", (event) => {
  const item = event.target.closest(".post-item[data-id]");
  if (!item) {
    return;
  }
  state.selectedId = item.dataset.id;
  renderAll();
});

setCommentFormEnabled(false);
prepareCreateForm();
loadPosts().catch((error) => {
  window.alert(error.message);
});
