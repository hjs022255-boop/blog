const {
  fetchPosts,
  generateId,
  methodNotAllowed,
  normalizeBody,
  sanitizePostInput,
  savePostById,
  sendJson
} = require("../_lib/firebase");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    try {
      const posts = await fetchPosts();
      sendJson(res, 200, { posts });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "목록 조회 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = normalizeBody(req.body);
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

  methodNotAllowed(res);
};
