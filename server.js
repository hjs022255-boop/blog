const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://js-blog-4264d-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_AUTH = process.env.FIREBASE_AUTH || "";
const FIREBASE_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BODY_BYTES = 20_000_000;
const MAX_IMAGE_DATA_URL_LENGTH = 16_000_000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_REQUEST_BODY_BYTES) {
        reject({ statusCode: 413, message: "요청 데이터가 너무 커요." });
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject({ statusCode: 400, message: "JSON 형식이 올바르지 않아요." });
      }
    });

    req.on("error", () => {
      reject({ statusCode: 500, message: "요청 처리 중 문제가 발생했어요." });
    });
  });
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(/\/+$/, "");
}

function getPostIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function getPostIdFromLikePath(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function getPostIdFromCommentsPath(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function getCommentPathIds(pathname) {
  const match = pathname.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    postId: decodeURIComponent(match[1]),
    commentId: decodeURIComponent(match[2])
  };
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
    const response = await fetch(buildFirebaseUrl(firebasePath), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

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
        statusCode: 502,
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

async function fetchPostById(postId) {
  const raw = await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, { method: "GET" });
  return normalizePost(raw, postId);
}

async function savePostById(postId, post) {
  await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, {
    method: "PUT",
    body: JSON.stringify(post)
  });
}

async function handleStaticFile(req, res, pathname) {
  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(targetPath));
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "접근할 수 없는 경로예요.");
    return;
  }

  try {
    const stat = await fsp.stat(normalized);
    if (!stat.isFile()) {
      sendText(res, 404, "파일을 찾지 못했어요.");
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fsp.readFile(normalized);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch (error) {
    sendText(res, 404, "파일을 찾지 못했어요.");
  }
}

async function handleApi(req, res, pathname) {
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/posts") {
    try {
      const raw = await firebaseRequest("/posts", { method: "GET" });
      const posts = Object.entries(raw || {})
        .map(([id, post]) => normalizePost(post, id))
        .filter(Boolean)
        .sort((a, b) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

      sendJson(res, 200, { posts });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "목록 조회 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (method === "POST" && pathname === "/api/posts") {
    try {
      const body = await parseBody(req);
      const input = sanitizePostInput(body);

      if (input.error) {
        sendJson(res, 400, { message: input.error });
        return;
      }

      const now = new Date().toISOString();
      const id = generateId();
      const newPost = {
        title: input.title,
        content: input.content,
        imageDataUrl: input.imageDataUrl || "",
        createdAt: now,
        updatedAt: now,
        likes: 0,
        comments: []
      };

      await savePostById(id, newPost);

      sendJson(res, 201, { post: { id, ...newPost } });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 생성 중 문제가 생겼어요."
      });
    }
    return;
  }

  const likePostId = getPostIdFromLikePath(pathname);
  if (likePostId && method === "POST") {
    try {
      const existing = await fetchPostById(likePostId);
      if (!existing) {
        sendJson(res, 404, { message: "좋아요를 누를 글을 찾지 못했어요." });
        return;
      }

      const now = new Date().toISOString();
      const updated = {
        title: existing.title,
        content: existing.content,
        imageDataUrl: existing.imageDataUrl || "",
        createdAt: existing.createdAt || now,
        updatedAt: now,
        likes: (existing.likes || 0) + 1,
        comments: existing.comments || []
      };

      await savePostById(likePostId, updated);
      sendJson(res, 200, { likes: updated.likes });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "좋아요 처리 중 문제가 생겼어요."
      });
    }
    return;
  }

  const commentPostId = getPostIdFromCommentsPath(pathname);
  if (commentPostId && method === "POST") {
    try {
      const body = await parseBody(req);
      const commentInput = sanitizeCommentInput(body);
      if (commentInput.error) {
        sendJson(res, 400, { message: commentInput.error });
        return;
      }

      const existing = await fetchPostById(commentPostId);
      if (!existing) {
        sendJson(res, 404, { message: "댓글 달 글을 찾지 못했어요." });
        return;
      }

      const now = new Date().toISOString();
      const newComment = {
        id: generateId(),
        text: commentInput.text,
        createdAt: now
      };

      const updated = {
        title: existing.title,
        content: existing.content,
        imageDataUrl: existing.imageDataUrl || "",
        createdAt: existing.createdAt || now,
        updatedAt: now,
        likes: existing.likes || 0,
        comments: [...(existing.comments || []), newComment]
      };

      await savePostById(commentPostId, updated);
      sendJson(res, 201, { comment: newComment });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "댓글 등록 중 문제가 생겼어요."
      });
    }
    return;
  }

  const commentPathIds = getCommentPathIds(pathname);
  if (commentPathIds && method === "DELETE") {
    try {
      const existing = await fetchPostById(commentPathIds.postId);
      if (!existing) {
        sendJson(res, 404, { message: "댓글 삭제할 글을 찾지 못했어요." });
        return;
      }

      const hasComment = (existing.comments || []).some((item) => item.id === commentPathIds.commentId);
      if (!hasComment) {
        sendJson(res, 404, { message: "삭제할 댓글을 찾지 못했어요." });
        return;
      }

      const now = new Date().toISOString();
      const updated = {
        title: existing.title,
        content: existing.content,
        imageDataUrl: existing.imageDataUrl || "",
        createdAt: existing.createdAt || now,
        updatedAt: now,
        likes: existing.likes || 0,
        comments: (existing.comments || []).filter((item) => item.id !== commentPathIds.commentId)
      };

      await savePostById(commentPathIds.postId, updated);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "댓글 삭제 중 문제가 생겼어요."
      });
    }
    return;
  }

  const postId = getPostIdFromPath(pathname);
  if (!postId) {
    sendJson(res, 404, { message: "잘못된 API 경로예요." });
    return;
  }

  if (method === "GET") {
    try {
      const post = await fetchPostById(postId);
      if (!post) {
        sendJson(res, 404, { message: "글을 찾지 못했어요." });
        return;
      }
      sendJson(res, 200, { post });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 조회 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (method === "PUT") {
    try {
      const body = await parseBody(req);
      const input = sanitizePostInput(body);
      if (input.error) {
        sendJson(res, 400, { message: input.error });
        return;
      }

      const existing = await fetchPostById(postId);
      if (!existing) {
        sendJson(res, 404, { message: "수정할 글을 찾지 못했어요." });
        return;
      }

      const now = new Date().toISOString();
      const updated = {
        title: input.title,
        content: input.content,
        imageDataUrl: input.hasImageField ? input.imageDataUrl : existing.imageDataUrl || "",
        createdAt: existing.createdAt || now,
        updatedAt: now,
        likes: existing.likes || 0,
        comments: existing.comments || []
      };

      await savePostById(postId, updated);

      sendJson(res, 200, { post: { id: postId, ...updated } });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 수정 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (method === "DELETE") {
    try {
      const existing = await fetchPostById(postId);
      if (!existing) {
        sendJson(res, 404, { message: "삭제할 글을 찾지 못했어요." });
        return;
      }

      await firebaseRequest(`/posts/${encodeURIComponent(postId)}`, {
        method: "DELETE"
      });

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 삭제 중 문제가 생겼어요."
      });
    }
    return;
  }

  sendJson(res, 405, { message: "지원하지 않는 요청 방식이에요." });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);
  const pathname = normalizePathname(url.pathname);

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  await handleStaticFile(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running: http://${HOST}:${PORT}`);
});
