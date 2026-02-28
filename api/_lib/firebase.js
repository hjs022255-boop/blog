const crypto = require("crypto");

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://js-blog-4264d-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_AUTH = process.env.FIREBASE_AUTH || "";
const FIREBASE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_DATA_URL_LENGTH = 16_000_000;

function sendJson(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function getPathParam(param) {
  if (Array.isArray(param)) {
    return param[0] || "";
  }
  return typeof param === "string" ? param : "";
}

function normalizeBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  if (typeof rawBody === "object") {
    return rawBody;
  }

  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return {};
    }
  }

  return {};
}

function generateId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `post-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildFirebaseUrl(firebasePath) {
  const base = FIREBASE_DB_URL.replace(/\/+$/, "");
  const safePath = firebasePath.startsWith("/") ? firebasePath : `/${firebasePath}`;
  const url = new URL(`${base}${safePath}.json`);

  if (FIREBASE_AUTH) {
    url.searchParams.set("auth", FIREBASE_AUTH);
  }

  return url.toString();
}

async function firebaseRequest(firebasePath, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIREBASE_TIMEOUT_MS);

  try {
    const requestOptions = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    };

    if (options.body !== undefined) {
      requestOptions.body =
        typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const response = await fetch(buildFirebaseUrl(firebasePath), requestOptions);
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      throw {
        statusCode: response.status >= 400 && response.status < 500 ? response.status : 502,
        message:
          data && data.error
            ? `Firebase 오류: ${data.error}`
            : "Firebase 응답에 문제가 있어요."
      };
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw { statusCode: 504, message: "Firebase 응답이 너무 늦어요." };
    }
    if (error && error.statusCode) {
      throw error;
    }
    throw { statusCode: 502, message: "Firebase 연결에 실패했어요." };
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizePostInput(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해줘." };
  }

  const hasImageField = Object.prototype.hasOwnProperty.call(body, "imageDataUrl");
  let imageDataUrl = "";

  if (hasImageField) {
    if (typeof body.imageDataUrl !== "string") {
      return { error: "이미지 데이터 형식이 올바르지 않아요." };
    }

    imageDataUrl = body.imageDataUrl.trim();
    if (imageDataUrl) {
      const isImageDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageDataUrl);
      if (!isImageDataUrl) {
        return { error: "이미지 데이터 형식이 올바르지 않아요." };
      }
      if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
        return { error: "이미지 크기가 너무 커요. 10MB 이하로 올려줘." };
      }
    }
  }

  return { title, content, imageDataUrl, hasImageField };
}

function sanitizeCommentInput(body) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return { error: "댓글 내용을 입력해줘." };
  }
  if (text.length > 500) {
    return { error: "댓글은 500자 이하로 작성해줘." };
  }
  return { text };
}

function normalizePost(raw, id) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const likes = Number.isFinite(raw.likes) ? Math.max(0, raw.likes) : 0;
  const comments = Array.isArray(raw.comments)
    ? raw.comments
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const text = typeof item.text === "string" ? item.text.trim() : "";
          if (!text) {
            return null;
          }
          return {
            id: typeof item.id === "string" && item.id ? item.id : generateId(),
            text,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : ""
          };
        })
        .filter(Boolean)
    : [];

  return {
    id,
    title: typeof raw.title === "string" ? raw.title : "",
    content: typeof raw.content === "string" ? raw.content : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    imageDataUrl: typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "",
    likes,
    comments
  };
}

async function fetchPosts() {
  const raw = await firebaseRequest("/posts", { method: "GET" });
  return Object.entries(raw || {})
    .map(([id, post]) => normalizePost(post, id))
    .filter(Boolean)
    .sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

async function fetchPostById(postId) {
  const raw = await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, { method: "GET" });
  return normalizePost(raw, postId);
}

async function savePostById(postId, post) {
  await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, {
    method: "PUT",
    body: post
  });
}

async function deletePostById(postId) {
  await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE"
  });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { message: "지원하지 않는 요청 방식이에요." });
}

module.exports = {
  deletePostById,
  fetchPostById,
  fetchPosts,
  generateId,
  getPathParam,
  methodNotAllowed,
  normalizeBody,
  sanitizeCommentInput,
  sanitizePostInput,
  savePostById,
  sendJson
};
