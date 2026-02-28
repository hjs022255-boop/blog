const openComposeBtn = document.getElementById("open-compose-btn");
const openLoginBtn = document.getElementById("open-login-btn");
const composeScreen = document.getElementById("compose-screen");
const closeComposeBtn = document.getElementById("close-compose-btn");
const composeTitleEl = document.getElementById("compose-title");
const loginScreen = document.getElementById("login-screen");
const closeLoginBtn = document.getElementById("close-login-btn");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginMessageEl = document.getElementById("login-message");
const loginSubmitBtn = document.getElementById("login-submit-btn");

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
  formImageDataUrl: "",
  auth: {
    isLoggedIn: false,
    email: ""
  }
};
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const LOGIN_ENDPOINT = "/api/auth/login";
const FIREBASE_WEB_API_KEY =
  window.FIREBASE_WEB_API_KEY ||
  "AIzaSyCaPRkCOvcNpTHqDOdlMhRAojyZoq9q1RU";

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

async function firebaseAuthRequest(endpoint, payload) {
  if (!FIREBASE_WEB_API_KEY) {
    return {
      ok: false,
      data: { error: { message: "MISSING_API_KEY" } }
    };
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${encodeURIComponent(
    FIREBASE_WEB_API_KEY
  )}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  } catch (error) {
    return {
      ok: false,
      data: { error: { message: "NETWORK_ERROR" } }
    };
  }
}

async function loginWithFirebaseFallback(email, password) {
  const basePayload = {
    email,
    password,
    returnSecureToken: true
  };

  const signIn = await firebaseAuthRequest("signInWithPassword", basePayload);
  if (signIn.ok) {
    return {
      success: true,
      token: signIn.data.idToken || "",
      user: {
        email: signIn.data.email || email,
        localId: signIn.data.localId || ""
      }
    };
  }

  const reason =
    signIn.data &&
    signIn.data.error &&
    typeof signIn.data.error.message === "string"
      ? signIn.data.error.message
      : "";

  if (reason !== "INVALID_LOGIN_CREDENTIALS" && reason !== "EMAIL_NOT_FOUND") {
    if (reason === "OPERATION_NOT_ALLOWED") {
      return {
        success: false,
        message: "Firebase에서 이메일/비밀번호 로그인을 먼저 켜줘."
      };
    }
    if (reason === "MISSING_API_KEY") {
      return {
        success: false,
        message: "Firebase API 키가 없어서 로그인할 수 없어."
      };
    }
    return {
      success: false,
      message: "로그인 처리 중 문제가 생겼어."
    };
  }

  const signUp = await firebaseAuthRequest("signUp", basePayload);
  if (signUp.ok) {
    return {
      success: true,
      token: signUp.data.idToken || "",
      user: {
        email: signUp.data.email || email,
        localId: signUp.data.localId || ""
      }
    };
  }

  const signUpReason =
    signUp.data &&
    signUp.data.error &&
    typeof signUp.data.error.message === "string"
      ? signUp.data.error.message
      : "";

  if (signUpReason === "EMAIL_EXISTS") {
    return {
      success: false,
      message: "이메일 또는 비밀번호를 확인해줘."
    };
  }

  return {
    success: false,
    message: "회원 처리 중 문제가 생겼어."
  };
}

async function loginWithServer(email, password) {
  try {
    const response = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      if (data && data.success === true) {
        return data;
      }
      return {
        success: false,
        message: data.message || "로그인에 실패했어."
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "로그인 서버 연결에 실패했어."
    };
  }

  return {
    success: false,
    message: "로그인 서버 응답이 올바르지 않아."
  };
}

async function loginWithFallback(email, password) {
  const firebaseResult = await loginWithFirebaseFallback(email, password);
  if (firebaseResult.success === true) {
    return firebaseResult;
  }

  if (
    firebaseResult.message !== "Firebase API 키가 없어서 로그인할 수 없어." &&
    firebaseResult.message !== "Firebase에서 이메일/비밀번호 로그인을 먼저 켜줘." &&
    firebaseResult.message !== "로그인 처리 중 문제가 생겼어."
  ) {
    return firebaseResult;
  }

  // Firebase 직접 로그인 설정이 없거나 실패하면 /api 경로로 한 번 더 시도.
  return loginWithServer(email, password);
}

function setMessage(message, isError = false) {
  formMessageEl.textContent = message || "";
  formMessageEl.style.color = isError ? "#fca5a5" : "#a3a9b4";
}

function setLoginMessage(message, isError = false) {
  loginMessageEl.textContent = message || "";
  loginMessageEl.style.color = isError ? "#fca5a5" : "#a3a9b4";
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

function openLogin() {
  loginScreen.classList.remove("hidden");
}

function closeLogin() {
  loginScreen.classList.add("hidden");
}

function renderAuthButton() {
  if (state.auth.isLoggedIn) {
    openLoginBtn.textContent = `로그인됨: ${state.auth.email}`;
  } else {
    openLoginBtn.textContent = "로그인";
  }
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

async function handleLoginSubmit(event) {
  event.preventDefault();

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value.trim();

  if (!email || !password) {
    setLoginMessage("이메일이랑 비밀번호를 입력해줘.", true);
    return;
  }

  try {
    loginSubmitBtn.disabled = true;
    setLoginMessage("로그인 확인중...");

    const result = await loginWithFallback(email, password);

    if (!result || result.success !== true) {
      throw new Error(result.message || "로그인에 실패했어.");
    }

    state.auth.isLoggedIn = true;
    state.auth.email = (result.user && result.user.email) || email;
    renderAuthButton();
    setLoginMessage("로그인 완료.");

    setTimeout(() => {
      closeLogin();
      loginForm.reset();
      setLoginMessage("");
    }, 400);
  } catch (error) {
    setLoginMessage(error.message || "이메일 또는 비밀번호를 확인해줘.", true);
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

openComposeBtn.addEventListener("click", () => {
  prepareCreateForm();
  openCompose();
});

openLoginBtn.addEventListener("click", () => {
  if (state.auth.isLoggedIn) {
    state.auth.isLoggedIn = false;
    state.auth.email = "";
    renderAuthButton();
    return;
  }

  setLoginMessage("");
  openLogin();
});

closeComposeBtn.addEventListener("click", () => {
  closeCompose();
});

closeLoginBtn.addEventListener("click", () => {
  closeLogin();
});

postForm.addEventListener("submit", handleSubmit);
loginForm.addEventListener("submit", handleLoginSubmit);
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
renderAuthButton();
loadPosts().catch((error) => {
  window.alert(error.message);
});
